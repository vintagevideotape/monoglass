import { matchLegacy } from '../src/domain/match'
import { accountName, itemToFields, MAX_WINDOW, PAGE_SIZE, statementWindows, UAH } from '../src/domain/monoApi'
import type { MonoClientInfo, MonoOpFields, MonoStatementItem } from '../src/domain/monoApi'
import { open } from './crypto'
import { chunks, getState, setState } from './env'
import type { Env } from './env'

/** Банк разрешает один запрос в 60 секунд; берём с запасом. */
const MIN_GAP = 61
const CLIENT_INFO_EVERY = 6 * 3600
/** Последние дни перечитываются: блокировки превращаются в списания, суммы уточняются. */
const OVERLAP = 2 * 86400
const FX_EVERY = 12 * 3600
const MAX_ATTEMPTS = 5
const PERSONAL_CARDS = new Set(['black', 'white', 'platinum', 'iron', 'yellow'])

export type TickResult = { action: 'idle' | 'wait' | 'accounts' | 'history' | 'update' | 'error'; detail: string; changed?: number }

type AccountLite = { id: string; currency: number; synced_to: number; checked_at: number }
type Job = { id: number; account_id: string; from_ts: number; to_ts: number; attempts: number }

/** Токен профиля: введённый в приложении и расшифрованный; при локальном запуске — из переменной. */
export async function tokenOf(env: Env, owner: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT mono_token FROM profiles WHERE id = ?').bind(owner).first<{ mono_token: string | null }>()
  if (row?.mono_token) return open(env, owner, row.mono_token)
  return env.MONO_TOKEN ?? null
}

async function monoGet<T>(env: Env, token: string, path: string): Promise<{ status: number; data: T | null }> {
  const base = env.MONO_BASE ?? 'https://api.monobank.ua'
  const response = await fetch(`${base}${path}`, { headers: { 'X-Token': token } })
  if (!response.ok) return { status: response.status, data: null }
  return { status: 200, data: (await response.json()) as T }
}

function problem(status: number): string {
  if (status === 429) return 'Банк просит подождать: слишком частые запросы'
  if (status === 401 || status === 403) return 'Банк не принял токен: введите его заново'
  return `Банк ответил ошибкой ${status}`
}

async function fail(db: D1Database, owner: string, now: number, message: string): Promise<TickResult> {
  await db.batch([setState(db, owner, 'mono.error', message), setState(db, owner, 'mono.error_at', String(now))])
  return { action: 'error', detail: message }
}

/** Очередь на загрузку истории счёта: окна по 31 дню, от новых к старым. */
export function backfillStatements(db: D1Database, owner: string, accountId: string, now: number, days: number): D1PreparedStatement[] {
  const jobs = statementWindows(now - days * 86400, now).map((w) =>
    db.prepare('INSERT INTO sync_jobs (owner, account_id, from_ts, to_ts, created_at) VALUES (?, ?, ?, ?, ?)').bind(owner, accountId, w.from, w.to, now),
  )
  return [...jobs, db.prepare('UPDATE accounts SET backfill_queued = 1, synced_to = ?, updated_at = ? WHERE owner = ? AND id = ?').bind(now, now * 1000, owner, accountId)]
}

const UPSERT = `INSERT INTO ops (owner, id, source, account_id, at, description, mcc, amount, currency, operation_amount, operation_currency, balance, hold, cashback, commission, comment, counter_name,
  legacy_id, legacy_account, legacy_category, legacy_subcategory, legacy_project, legacy_transfer, set_kind, set_category, set_subcategory, note, updated_at)
VALUES (?, ?, 'mono', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (owner, id) DO UPDATE SET source = 'mono', account_id = excluded.account_id, at = excluded.at, description = excluded.description, mcc = excluded.mcc,
  amount = excluded.amount, currency = excluded.currency, operation_amount = excluded.operation_amount, operation_currency = excluded.operation_currency,
  balance = excluded.balance, hold = excluded.hold, cashback = excluded.cashback, commission = excluded.commission, comment = excluded.comment,
  counter_name = excluded.counter_name, deleted = 0, updated_at = excluded.updated_at
WHERE ops.source != 'mono' OR ops.amount != excluded.amount OR ops.hold != excluded.hold OR ops.description != excluded.description
  OR ops.account_id != excluded.account_id OR ops.at != excluded.at OR ops.balance IS NOT excluded.balance OR ops.deleted != 0`

type LegacyRow = {
  id: string
  at: number
  amount: number
  description: string
  legacy_account: string | null
  legacy_category: string | null
  legacy_subcategory: string | null
  legacy_project: number
  legacy_transfer: number
  set_kind: string | null
  set_category: string | null
  set_subcategory: string | null
  note: string
}

/**
 * Записывает операции банка. Повторная загрузка ничего не дублирует: ключ — ID операции.
 * Строка старой таблицы с тем же ID становится операцией банка и сохраняет свою разметку;
 * строка с другим ID, но той же суммой и временем — отдаёт разметку и снимается.
 */
export async function ingest(db: D1Database, owner: string, accountId: string, currency: number, items: MonoStatementItem[], nowMs: number): Promise<number> {
  if (items.length === 0) return 0
  const fields = items.map((item) => itemToFields(item, currency))
  const min = Math.min(...fields.map((f) => f.at))
  const max = Math.max(...fields.map((f) => f.at))

  const [legacyResult, knownResult] = await db.batch([
    db
      .prepare(
        `SELECT id, at, amount, description, legacy_account, legacy_category, legacy_subcategory, legacy_project, legacy_transfer, set_kind, set_category, set_subcategory, note
         FROM ops WHERE owner = ? AND source = 'legacy' AND deleted = 0 AND at BETWEEN ? AND ?`,
      )
      .bind(owner, min - 300, max + 300),
    db.prepare("SELECT id FROM ops WHERE owner = ? AND source = 'mono' AND at BETWEEN ? AND ?").bind(owner, min - 1, max + 1),
  ])
  const legacy = legacyResult.results as LegacyRow[]
  const known = new Set((knownResult.results as { id: string }[]).map((r) => r.id))
  const legacyById = new Map(legacy.map((row) => [row.id, row]))

  const fresh = fields.filter((f) => !known.has(f.id))
  const donors = new Map<string, LegacyRow>()
  for (const pair of matchLegacy(fresh, legacy)) {
    const donor = legacyById.get(pair.legacyId)
    if (pair.by === 'fingerprint' && donor) donors.set(pair.monoId, donor)
  }

  const statements: D1PreparedStatement[] = []
  const upsert = db.prepare(UPSERT)
  const retire = db.prepare("UPDATE ops SET deleted = 1, updated_at = ? WHERE owner = ? AND id = ? AND source = 'legacy'")
  for (const f of fields as MonoOpFields[]) {
    const donor = donors.get(f.id)
    statements.push(
      upsert.bind(
        owner, f.id, accountId, f.at, f.description, f.mcc, f.amount, f.currency, f.operation_amount, f.operation_currency, f.balance, f.hold, f.cashback, f.commission, f.comment, f.counter_name,
        donor?.id ?? null, donor?.legacy_account ?? null, donor?.legacy_category ?? null, donor?.legacy_subcategory ?? null, donor?.legacy_project ?? 0, donor?.legacy_transfer ?? 0,
        donor?.set_kind ?? null, donor?.set_category ?? null, donor?.set_subcategory ?? null, donor?.note ?? '', nowMs,
      ),
    )
    if (donor) statements.push(retire.bind(nowMs, owner, donor.id))
  }

  let changed = 0
  for (const part of chunks(statements, 50)) {
    const results = await db.batch(part)
    for (const result of results) changed += result.meta.changes ?? 0
  }
  return changed
}

/** Сохраняет счета и банки из ответа банка. */
export async function refreshAccounts(env: Env, owner: string, token: string, now: number): Promise<TickResult & { status: number }> {
  const db = env.DB
  await setState(db, owner, 'mono.request_at', String(now)).run()
  const { status, data } = await monoGet<MonoClientInfo>(env, token, '/personal/client-info')
  if (!data) return { ...(await fail(db, owner, now, problem(status))), status }
  const ms = now * 1000
  const statements: D1PreparedStatement[] = []
  for (const account of data.accounts ?? []) {
    const sync = account.currencyCode === UAH && PERSONAL_CARDS.has(account.type) ? 1 : 0
    statements.push(
      db
        .prepare(
          `INSERT INTO accounts (owner, id, source, name, type, currency, balance, credit_limit, masked_pan, sync, updated_at) VALUES (?, ?, 'mono', ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (owner, id) DO UPDATE SET type = excluded.type, currency = excluded.currency, balance = excluded.balance, credit_limit = excluded.credit_limit,
             masked_pan = excluded.masked_pan, updated_at = excluded.updated_at`,
        )
        .bind(owner, account.id, accountName(account), account.type, account.currencyCode, account.balance, account.creditLimit, account.maskedPan?.[0] ?? '', sync, ms),
    )
  }
  for (const jar of data.jars ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO jars (owner, id, title, currency, balance, goal, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (owner, id) DO UPDATE SET title = excluded.title, currency = excluded.currency, balance = excluded.balance, goal = excluded.goal, updated_at = excluded.updated_at`,
        )
        .bind(owner, jar.id, jar.title, jar.currencyCode, jar.balance, jar.goal ?? null, ms),
    )
  }
  statements.push(setState(db, owner, 'mono.client_info_at', String(now)), setState(db, owner, 'mono.error', ''))
  await db.batch(statements)
  return { action: 'accounts', detail: `Счета обновлены: ${data.accounts?.length ?? 0}`, status: 200 }
}

async function fetchWindow(env: Env, token: string, owner: string, account: AccountLite, from: number, to: number, nowMs: number) {
  const { status, data } = await monoGet<MonoStatementItem[]>(env, token, `/personal/statement/${encodeURIComponent(account.id)}/${from}/${to}`)
  if (!data) return { status, changed: 0, more: null as number | null, newest: null as MonoStatementItem | null }
  const changed = await ingest(env.DB, owner, account.id, account.currency, data, nowMs)
  let more: number | null = null
  if (data.length >= PAGE_SIZE) {
    const oldest = Math.min(...data.map((item) => item.time))
    more = oldest >= to ? to - 1 : oldest
  }
  const newest = data.reduce<MonoStatementItem | null>((best, item) => (!best || item.time > best.time ? item : best), null)
  return { status, changed, more, newest }
}

async function runJob(env: Env, token: string, owner: string, job: Job, now: number): Promise<TickResult> {
  const db = env.DB
  const account = await db.prepare('SELECT id, currency, synced_to, checked_at FROM accounts WHERE owner = ? AND id = ?').bind(owner, job.account_id).first<AccountLite>()
  if (!account) {
    await db.prepare("UPDATE sync_jobs SET status = 'failed', error = 'Счёт не найден', done_at = ? WHERE id = ?").bind(now, job.id).run()
    return { action: 'error', detail: 'Счёт не найден' }
  }
  const result = await fetchWindow(env, token, owner, account, job.from_ts, job.to_ts, now * 1000)
  if (result.status !== 200) {
    if (result.status !== 429) {
      const attempts = job.attempts + 1
      await db
        .prepare('UPDATE sync_jobs SET attempts = ?, status = ?, error = ?, done_at = ? WHERE id = ?')
        .bind(attempts, attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', problem(result.status), attempts >= MAX_ATTEMPTS ? now : null, job.id)
        .run()
    }
    return fail(db, owner, now, problem(result.status))
  }
  const statements = [db.prepare("UPDATE sync_jobs SET status = 'done', done_at = ? WHERE id = ?").bind(now, job.id), setState(db, owner, 'mono.error', '')]
  if (result.more !== null && result.more > job.from_ts) {
    statements.push(db.prepare('INSERT INTO sync_jobs (owner, account_id, from_ts, to_ts, created_at) VALUES (?, ?, ?, ?, ?)').bind(owner, job.account_id, job.from_ts, result.more, now))
  }
  await db.batch(statements)
  return { action: 'history', detail: 'Загружено окно истории', changed: result.changed }
}

async function update(env: Env, token: string, owner: string, account: AccountLite, now: number): Promise<TickResult> {
  const db = env.DB
  const from = Math.max(account.synced_to - OVERLAP, now - MAX_WINDOW + 3600)
  const result = await fetchWindow(env, token, owner, account, from, now, now * 1000)
  if (result.status !== 200) {
    await db.prepare('UPDATE accounts SET checked_at = ? WHERE owner = ? AND id = ?').bind(now, owner, account.id).run()
    return fail(db, owner, now, problem(result.status))
  }
  const statements = [
    db.prepare('UPDATE accounts SET checked_at = ?, synced_to = ? WHERE owner = ? AND id = ?').bind(now, now, owner, account.id),
    setState(db, owner, 'mono.error', ''),
    setState(db, owner, 'mono.ok_at', String(now)),
  ]
  if (result.newest && typeof result.newest.balance === 'number') {
    statements.push(db.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE owner = ? AND id = ? AND balance != ?').bind(result.newest.balance, now * 1000, owner, account.id, result.newest.balance))
  }
  if (result.more !== null && result.more > from) {
    statements.push(db.prepare('INSERT INTO sync_jobs (owner, account_id, from_ts, to_ts, created_at) VALUES (?, ?, ?, ?, ?)').bind(owner, account.id, from, result.more, now))
  }
  await db.batch(statements)
  return { action: 'update', detail: 'Выписка обновлена', changed: result.changed }
}

/** Курс НБУ раз в полдня — для общей суммы с наличными в валюте. К лимиту Monobank не относится. */
async function refreshFx(db: D1Database, owner: string, now: number): Promise<void> {
  const at = Number((await getState(db, owner, 'fx.at')) ?? 0)
  if (now - at < FX_EVERY) return
  try {
    const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statistic/exchange?json')
    if (!response.ok) return
    const rates = (await response.json()) as { cc: string; rate: number; exchangedate: string }[]
    const pick = (cc: string) => rates.find((r) => r.cc === cc)?.rate ?? null
    await db.batch([setState(db, owner, 'fx', JSON.stringify({ USD: pick('USD'), EUR: pick('EUR'), date: rates[0]?.exchangedate ?? '' })), setState(db, owner, 'fx.at', String(now))])
  } catch {
    // Курс не критичен: остаётся прошлый.
  }
}

/**
 * Один шаг синхронизации: не больше одного запроса к Monobank.
 * Порядок: список счетов (раз в несколько часов) → очередь истории → свежая выписка по счетам по кругу.
 */
export async function tick(env: Env, owner: string, nowMs = Date.now()): Promise<TickResult> {
  const db = env.DB
  const now = Math.floor(nowMs / 1000)
  await refreshFx(db, owner, now)
  const token = await tokenOf(env, owner)
  if (!token) return { action: 'idle', detail: 'Токен Monobank не подключён' }

  const last = Number((await getState(db, owner, 'mono.request_at')) ?? 0)
  // Паузу можно сократить только вместе с подставным банком при локальной проверке.
  const gap = env.MONO_BASE ? Number(env.MONO_GAP ?? MIN_GAP) : MIN_GAP
  if (now - last < gap) return { action: 'wait', detail: `Следующий запрос к банку через ${gap - (now - last)} с` }
  await setState(db, owner, 'mono.request_at', String(now)).run()

  try {
    const infoAt = Number((await getState(db, owner, 'mono.client_info_at')) ?? 0)
    if (now - infoAt > CLIENT_INFO_EVERY) return await refreshAccounts(env, owner, token, now)

    const days = Math.max(31, Number(env.BACKFILL_DAYS ?? 400) || 400)
    const fresh = await db.prepare("SELECT id FROM accounts WHERE owner = ? AND source = 'mono' AND sync = 1 AND backfill_queued = 0 AND archived = 0").bind(owner).all<{ id: string }>()
    for (const account of fresh.results) await db.batch(backfillStatements(db, owner, account.id, now, days))

    const job = await db.prepare("SELECT id, account_id, from_ts, to_ts, attempts FROM sync_jobs WHERE owner = ? AND status = 'pending' ORDER BY to_ts DESC, id LIMIT 1").bind(owner).first<Job>()
    if (job) return await runJob(env, token, owner, job, now)

    const account = await db
      .prepare("SELECT id, currency, synced_to, checked_at FROM accounts WHERE owner = ? AND source = 'mono' AND sync = 1 AND archived = 0 ORDER BY checked_at LIMIT 1")
      .bind(owner)
      .first<AccountLite>()
    if (!account) return { action: 'idle', detail: 'Нет счетов для синхронизации' }
    return await update(env, token, owner, account, now)
  } catch (error) {
    return fail(db, owner, now, error instanceof Error ? `Сбой синхронизации: ${error.message}` : 'Сбой синхронизации')
  }
}
