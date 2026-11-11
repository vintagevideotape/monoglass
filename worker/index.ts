import { matchLegacy } from '../src/domain/match'
import { ownerOf } from './auth'
import { chunks, getState, HttpError, json } from './env'
import type { Env } from './env'
import { tick } from './sync'

const KINDS = new Set(['expense', 'refund', 'income', 'personIncoming', 'support', 'cashTopUp', 'jar', 'transfer', 'project'])
const SETTINGS = new Set(['plans', 'income', 'counterparties', 'categoryRules', 'apple'])
const OP_COLUMNS = `id, source, account_id, at, description, mcc, amount, currency, balance, hold, comment, counter_name, legacy_id, legacy_account, legacy_category,
  legacy_subcategory, legacy_project, legacy_transfer, set_kind, set_category, set_subcategory, note, recurring_id, period, updated_at, deleted`

type Body = Record<string, unknown>

function text(value: unknown, max = 300): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Ожидалась строка')
  return value.slice(0, max)
}
function optionalText(value: unknown, max = 300): string | null {
  return value === null || value === undefined || value === '' ? null : text(value, max)
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new HttpError(400, 'Ожидалось целое число')
  return value
}
function kind(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !KINDS.has(value)) throw new HttpError(400, 'Неизвестный вид операции')
  return value
}
function flag(value: unknown): number {
  return value ? 1 : 0
}

async function body(request: Request): Promise<Body> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) throw new HttpError(415, 'Нужен JSON')
  const data = (await request.json().catch(() => null)) as unknown
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new HttpError(400, 'Нужен JSON-объект')
  return data as Body
}

/** Изменения принимаются только с того же адреса, что и само приложение. */
function sameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new HttpError(403, 'Чужой источник запроса')
}

/** Стартовый набор при первом входе: наличные счета и два регулярных платежа с незаданной суммой. */
async function seed(db: D1Database, owner: string): Promise<void> {
  if ((await getState(db, owner, 'seeded')) !== null) return
  const ms = Date.now()
  const now = Math.floor(ms / 1000)
  const account = db.prepare("INSERT OR IGNORE INTO accounts (owner, id, source, name, type, currency, opened_at, updated_at) VALUES (?, ?, 'cash', ?, 'cash', ?, ?, ?)")
  const recurring = db.prepare('INSERT OR IGNORE INTO recurring (owner, id, name, day, category, account_id, variable, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  await db.batch([
    account.bind(owner, 'cash-uah', 'Наличные ₴', 980, now, ms),
    account.bind(owner, 'cash-usd', 'Наличные $', 840, now, ms),
    recurring.bind(owner, 'rent', 'Аренда', 1, 'Жильё', 'cash-uah', 0, ms),
    recurring.bind(owner, 'utilities', 'Коммуналка', 20, 'Жильё', 'cash-uah', 1, ms),
    db.prepare("INSERT OR IGNORE INTO state (owner, key, value) VALUES (?, 'seeded', '1')").bind(owner),
  ])
}

async function state(env: Env, owner: { id: string; email: string }, url: URL): Promise<Response> {
  const db = env.DB
  await seed(db, owner.id)
  const since = Number(url.searchParams.get('since') ?? 0) || 0
  const [accounts, jars, recurring, settings, service, jobs, ops] = await db.batch([
    db.prepare('SELECT id, source, name, type, currency, balance, credit_limit, opening_balance, opened_at, masked_pan, sync, synced_to, checked_at, archived FROM accounts WHERE owner = ? ORDER BY source DESC, name').bind(owner.id),
    db.prepare('SELECT id, title, currency, balance, goal FROM jars WHERE owner = ? ORDER BY title').bind(owner.id),
    db.prepare('SELECT id, name, amount, currency, day, category, account_id, variable, active FROM recurring WHERE owner = ? ORDER BY day, name').bind(owner.id),
    db.prepare('SELECT key, value FROM settings WHERE owner = ?').bind(owner.id),
    db.prepare('SELECT key, value FROM state WHERE owner = ?').bind(owner.id),
    db.prepare('SELECT status, COUNT(*) AS n FROM sync_jobs WHERE owner = ? GROUP BY status').bind(owner.id),
    since > 0
      ? db.prepare(`SELECT ${OP_COLUMNS} FROM ops WHERE owner = ? AND updated_at > ? ORDER BY at DESC`).bind(owner.id, since - 2000)
      : db.prepare(`SELECT ${OP_COLUMNS} FROM ops WHERE owner = ? AND deleted = 0 ORDER BY at DESC`).bind(owner.id),
  ])
  const svc = Object.fromEntries((service.results as { key: string; value: string }[]).map((row) => [row.key, row.value]))
  const jobCount = Object.fromEntries((jobs.results as { status: string; n: number }[]).map((row) => [row.status, row.n]))
  return json({
    profile: { email: owner.email },
    serverTime: Date.now(),
    full: since === 0,
    accounts: accounts.results,
    jars: jars.results,
    recurring: recurring.results,
    settings: Object.fromEntries((settings.results as { key: string; value: string }[]).map((row) => [row.key, JSON.parse(row.value)])),
    ops: ops.results,
    fx: svc.fx ? JSON.parse(svc.fx) : null,
    sync: {
      hasToken: Boolean(env.MONO_TOKEN),
      requestAt: Number(svc['mono.request_at'] ?? 0),
      okAt: Number(svc['mono.ok_at'] ?? 0),
      accountsAt: Number(svc['mono.client_info_at'] ?? 0),
      error: svc['mono.error'] ?? '',
      errorAt: Number(svc['mono.error_at'] ?? 0),
      jobs: { pending: jobCount.pending ?? 0, done: jobCount.done ?? 0, failed: jobCount.failed ?? 0 },
    },
  })
}

type LegacyIn = { id: string; at: number; description: string; mcc: string; amount: number; account: string; category: string; subcategory: string; isProject: number; isTransfer: number }

/**
 * Перенос листа Transactions старой таблицы. Можно запускать повторно: дублей не будет.
 * Строка, которая уже есть в выписке банка (по ID или по сумме и времени), отдаёт свою разметку операции банка.
 */
async function importLegacy(db: D1Database, owner: string, data: Body): Promise<Response> {
  if (!Array.isArray(data.rows) || data.rows.length > 300) throw new HttpError(400, 'Ожидалось до 300 строк')
  const rows: LegacyIn[] = (data.rows as Body[]).map((row) => ({
    id: text(row.id, 120),
    at: integer(row.at),
    description: text(row.description),
    mcc: text(row.mcc, 8),
    amount: integer(row.amount),
    account: text(row.account, 80),
    category: text(row.category, 80),
    subcategory: text(row.subcategory, 80),
    isProject: flag(row.isProject),
    isTransfer: flag(row.isTransfer),
  }))
  if (rows.length === 0) return json({ added: 0, matchedById: 0, matchedByFingerprint: 0, known: 0 })
  if (rows.some((row) => row.id === '')) throw new HttpError(400, 'У строки нет ID')

  const existing = new Map<string, string>()
  const mergedEarlier = new Set<string>()
  for (const part of chunks(rows.map((row) => row.id), 90)) {
    const marks = part.map(() => '?').join(',')
    const [byId, byLegacyId] = await db.batch([
      db.prepare(`SELECT id, source FROM ops WHERE owner = ? AND id IN (${marks})`).bind(owner, ...part),
      db.prepare(`SELECT legacy_id FROM ops WHERE owner = ? AND legacy_id IN (${marks})`).bind(owner, ...part),
    ])
    for (const row of byId.results as { id: string; source: string }[]) existing.set(row.id, row.source)
    for (const row of byLegacyId.results as { legacy_id: string }[]) mergedEarlier.add(row.legacy_id)
  }

  const fresh = rows.filter((row) => !existing.has(row.id) && !mergedEarlier.has(row.id))
  const pairs = new Map<string, string>()
  if (fresh.length > 0) {
    const min = Math.min(...fresh.map((row) => row.at))
    const max = Math.max(...fresh.map((row) => row.at))
    const candidates = await db
      .prepare("SELECT id, at, amount, description FROM ops WHERE owner = ? AND source = 'mono' AND legacy_category IS NULL AND deleted = 0 AND at BETWEEN ? AND ?")
      .bind(owner, min - 300, max + 300)
      .all<{ id: string; at: number; amount: number; description: string }>()
    for (const pair of matchLegacy(candidates.results, fresh)) pairs.set(pair.legacyId, pair.monoId)
  }

  const ms = Date.now()
  const annotate = db.prepare(
    `UPDATE ops SET legacy_id = ?, legacy_account = ?, legacy_category = ?, legacy_subcategory = ?, legacy_project = ?, legacy_transfer = ?, updated_at = ?
     WHERE owner = ? AND id = ? AND source = 'mono' AND legacy_category IS NULL`,
  )
  const insert = db.prepare(
    `INSERT INTO ops (owner, id, source, at, description, mcc, amount, legacy_account, legacy_category, legacy_subcategory, legacy_project, legacy_transfer, updated_at)
     VALUES (?, ?, 'legacy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner, id) DO NOTHING`,
  )
  const counts = { added: 0, matchedById: 0, matchedByFingerprint: 0, known: 0 }
  const statements: { statement: D1PreparedStatement; as: keyof typeof counts }[] = []
  for (const row of rows) {
    const monoId = pairs.get(row.id)
    if (existing.get(row.id) === 'mono') {
      statements.push({ statement: annotate.bind(null, row.account, row.category, row.subcategory, row.isProject, row.isTransfer, ms, owner, row.id), as: 'matchedById' })
    } else if (existing.has(row.id) || mergedEarlier.has(row.id)) {
      counts.known += 1
    } else if (monoId) {
      statements.push({ statement: annotate.bind(row.id, row.account, row.category, row.subcategory, row.isProject, row.isTransfer, ms, owner, monoId), as: 'matchedByFingerprint' })
    } else {
      statements.push({ statement: insert.bind(owner, row.id, row.at, row.description, row.mcc, row.amount, row.account, row.category, row.subcategory, row.isProject, row.isTransfer, ms), as: 'added' })
    }
  }
  for (const part of chunks(statements, 50)) {
    const results = await db.batch(part.map((item) => item.statement))
    results.forEach((result, index) => {
      if ((result.meta.changes ?? 0) > 0) counts[part[index].as] += 1
      else counts.known += 1
    })
  }
  return json(counts)
}

/** Сверка переноса: сколько строк таблицы нашли пару в выписке, сколько осталось без пары, нет ли возможных дублей. */
async function legacyReport(db: D1Database, owner: string): Promise<Response> {
  const totals = await db
    .prepare(
      `SELECT
         COALESCE(SUM(source = 'legacy' AND deleted = 0), 0) AS unmatched,
         COALESCE(SUM(source = 'mono' AND legacy_category IS NOT NULL AND legacy_id IS NULL), 0) AS matchedById,
         COALESCE(SUM(source = 'mono' AND legacy_id IS NOT NULL), 0) AS matchedByFingerprint,
         COALESCE(SUM(source = 'mono' AND deleted = 0), 0) AS bank,
         COALESCE(SUM(source = 'mono' AND legacy_category IS NULL AND deleted = 0), 0) AS bankOnly,
         COALESCE(SUM(source = 'manual' AND deleted = 0), 0) AS manual,
         MIN(CASE WHEN source = 'mono' THEN at END) AS bankFrom,
         MIN(CASE WHEN legacy_category IS NOT NULL AND deleted = 0 THEN at END) AS legacyFrom,
         MAX(CASE WHEN legacy_category IS NOT NULL AND deleted = 0 THEN at END) AS legacyTo,
         COALESCE(SUM(CASE WHEN legacy_category IS NOT NULL AND deleted = 0 AND amount > 0 THEN amount ELSE 0 END), 0) AS legacyIn,
         COALESCE(SUM(CASE WHEN legacy_category IS NOT NULL AND deleted = 0 AND amount < 0 THEN -amount ELSE 0 END), 0) AS legacyOut
       FROM ops WHERE owner = ?`,
    )
    .bind(owner)
    .first<Record<string, number | null>>()
  const bankFrom = totals?.bankFrom ?? null
  const [inside, twins] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM ops WHERE owner = ? AND source = 'legacy' AND deleted = 0 AND at >= ?").bind(owner, bankFrom ?? 9e15),
    db.prepare(
      `SELECT COUNT(*) AS n FROM ops l WHERE l.owner = ? AND l.source = 'legacy' AND l.deleted = 0 AND EXISTS (
         SELECT 1 FROM ops m WHERE m.owner = l.owner AND m.source = 'mono' AND m.deleted = 0 AND m.legacy_category IS NULL
           AND m.amount = l.amount AND m.at BETWEEN l.at - 3600 AND l.at + 3600)`,
    ).bind(owner),
  ])
  return json({
    ...totals,
    legacyTotal: (totals?.unmatched ?? 0) + (totals?.matchedById ?? 0) + (totals?.matchedByFingerprint ?? 0),
    unmatchedInsideBankPeriod: (inside.results[0] as { n: number }).n,
    possibleDuplicates: (twins.results[0] as { n: number }).n,
  })
}

async function createOp(db: D1Database, owner: string, data: Body): Promise<Response> {
  const id = typeof data.id === 'string' && /^m_[\w-]{8,60}$/.test(data.id) ? data.id : `m_${crypto.randomUUID()}`
  const accountId = text(data.account_id, 80)
  const account = await db.prepare("SELECT currency FROM accounts WHERE owner = ? AND id = ? AND source = 'cash'").bind(owner, accountId).first<{ currency: number }>()
  if (!account) throw new HttpError(400, 'Ручные операции вносятся на наличный счёт')
  const amount = integer(data.amount)
  if (amount === 0) throw new HttpError(400, 'Сумма не может быть нулевой')
  const opKind = kind(data.kind) ?? (amount > 0 ? 'income' : 'expense')
  const ms = Date.now()
  await db
    .prepare(
      `INSERT INTO ops (owner, id, source, account_id, at, description, amount, currency, set_kind, set_category, set_subcategory, note, recurring_id, period, updated_at)
       VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner, id) DO NOTHING`,
    )
    .bind(owner, id, accountId, data.at === undefined ? Math.floor(ms / 1000) : integer(data.at), text(data.description ?? ''), amount, account.currency, opKind,
      text(data.category ?? '', 80), text(data.subcategory ?? '', 80), text(data.note ?? '', 500), optionalText(data.recurring_id, 80), optionalText(data.period, 7), ms)
    .run()
  return json({ id })
}

async function patchOp(db: D1Database, owner: string, id: string, data: Body): Promise<Response> {
  const row = await db.prepare('SELECT source FROM ops WHERE owner = ? AND id = ? AND deleted = 0').bind(owner, id).first<{ source: string }>()
  if (!row) throw new HttpError(404, 'Операция не найдена')
  const sets: string[] = []
  const values: unknown[] = []
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`)
    values.push(value)
  }
  if ('kind' in data) set('set_kind', kind(data.kind))
  if ('category' in data) set('set_category', optionalText(data.category, 80))
  if ('subcategory' in data) set('set_subcategory', optionalText(data.subcategory, 80))
  if ('note' in data) set('note', text(data.note ?? '', 500))
  if (row.source === 'manual') {
    if ('amount' in data) set('amount', integer(data.amount))
    if ('at' in data) set('at', integer(data.at))
    if ('description' in data) set('description', text(data.description))
  } else if ('amount' in data || 'at' in data || 'description' in data) {
    throw new HttpError(400, 'Сумму, время и описание можно менять только у ручных операций')
  }
  if (sets.length === 0) throw new HttpError(400, 'Нечего менять')
  await db.prepare(`UPDATE ops SET ${sets.join(', ')}, updated_at = ? WHERE owner = ? AND id = ?`).bind(...values, Date.now(), owner, id).run()
  return json({ ok: true })
}

async function deleteOp(db: D1Database, owner: string, id: string): Promise<Response> {
  const result = await db.prepare("UPDATE ops SET deleted = 1, updated_at = ? WHERE owner = ? AND id = ? AND source = 'manual'").bind(Date.now(), owner, id).run()
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(400, 'Удалять можно только ручные операции')
  return json({ ok: true })
}

async function createAccount(db: D1Database, owner: string, data: Body): Promise<Response> {
  const id = `cash_${crypto.randomUUID()}`
  const ms = Date.now()
  await db
    .prepare("INSERT INTO accounts (owner, id, source, name, type, currency, opening_balance, opened_at, updated_at) VALUES (?, ?, 'cash', ?, 'cash', ?, ?, ?, ?)")
    .bind(owner, id, text(data.name, 60), integer(data.currency ?? 980), integer(data.opening_balance ?? 0), Math.floor(ms / 1000), ms)
    .run()
  return json({ id })
}

async function patchAccount(db: D1Database, owner: string, id: string, data: Body): Promise<Response> {
  const account = await db.prepare('SELECT source FROM accounts WHERE owner = ? AND id = ?').bind(owner, id).first<{ source: string }>()
  if (!account) throw new HttpError(404, 'Счёт не найден')
  const sets: string[] = []
  const values: unknown[] = []
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`)
    values.push(value)
  }
  if ('name' in data) set('name', text(data.name, 60))
  if ('archived' in data) set('archived', flag(data.archived))
  if (account.source === 'mono' && 'sync' in data) set('sync', flag(data.sync))
  if (account.source === 'cash' && 'opening_balance' in data) {
    // Новая стартовая сумма — новая точка отсчёта: пополнения карты до неё наличные уже не уменьшают.
    set('opening_balance', integer(data.opening_balance))
    set('opened_at', Math.floor(Date.now() / 1000))
  }
  if (sets.length === 0) throw new HttpError(400, 'Нечего менять')
  await db.prepare(`UPDATE accounts SET ${sets.join(', ')}, updated_at = ? WHERE owner = ? AND id = ?`).bind(...values, Date.now(), owner, id).run()
  return json({ ok: true })
}

async function putRecurring(db: D1Database, owner: string, id: string, data: Body): Promise<Response> {
  const day = integer(data.day ?? 1)
  if (day < 1 || day > 31) throw new HttpError(400, 'День месяца — от 1 до 31')
  const amount = integer(data.amount ?? 0)
  if (amount < 0) throw new HttpError(400, 'Сумма не может быть отрицательной')
  await db
    .prepare(
      `INSERT INTO recurring (owner, id, name, amount, currency, day, category, account_id, variable, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (owner, id) DO UPDATE SET name = excluded.name, amount = excluded.amount, currency = excluded.currency, day = excluded.day, category = excluded.category,
         account_id = excluded.account_id, variable = excluded.variable, active = excluded.active, updated_at = excluded.updated_at`,
    )
    .bind(owner, id, text(data.name, 60), amount, integer(data.currency ?? 980), day, text(data.category ?? '', 80), optionalText(data.account_id, 80), flag(data.variable), data.active === undefined ? 1 : flag(data.active), Date.now())
    .run()
  return json({ id })
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api/, '')
  const method = request.method
  const owner = await ownerOf(request, env)
  const db = env.DB
  if (method !== 'GET') sameOrigin(request)

  if (method === 'GET' && path === '/state') return state(env, owner, url)
  if (method === 'GET' && path === '/legacy/report') return legacyReport(db, owner.id)
  if (method === 'POST' && path === '/legacy/import') return importLegacy(db, owner.id, await body(request))
  if (method === 'POST' && path === '/sync/now') return json(await tick(env, owner.id))
  if (method === 'POST' && path === '/ops') return createOp(db, owner.id, await body(request))
  if (method === 'POST' && path === '/accounts') return createAccount(db, owner.id, await body(request))

  const [, section, rawId] = path.split('/')
  const id = rawId ? decodeURIComponent(rawId) : ''
  if (id !== '' && path.split('/').length === 3) {
    if (section === 'ops' && method === 'PATCH') return patchOp(db, owner.id, id, await body(request))
    if (section === 'ops' && method === 'DELETE') return deleteOp(db, owner.id, id)
    if (section === 'accounts' && method === 'PATCH') return patchAccount(db, owner.id, id, await body(request))
    if (section === 'recurring' && method === 'PUT') return putRecurring(db, owner.id, id.slice(0, 80), await body(request))
    if (section === 'recurring' && method === 'DELETE') {
      await db.prepare('DELETE FROM recurring WHERE owner = ? AND id = ?').bind(owner.id, id).run()
      return json({ ok: true })
    }
    if (section === 'settings' && method === 'PUT') {
      if (!SETTINGS.has(id)) throw new HttpError(400, 'Неизвестная настройка')
      const value = JSON.stringify((await body(request)).value ?? null)
      if (value.length > 200_000) throw new HttpError(413, 'Слишком большое значение')
      await db
        .prepare('INSERT INTO settings (owner, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
        .bind(owner.id, id, value, Date.now())
        .run()
      return json({ ok: true })
    }
  }
  throw new HttpError(404, 'Нет такого адреса')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return await api(request, env)
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      // В журнал — только тип сбоя, без данных.
      console.error('api failure', error instanceof Error ? error.name : 'unknown')
      return json({ error: 'Внутренняя ошибка' }, 500)
    }
  },

  /** Фоновая синхронизация: работает без открытого приложения. Токен принадлежит первому профилю — владельцу. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const owner = await env.DB.prepare('SELECT id FROM profiles ORDER BY created_at LIMIT 1').first<{ id: string }>()
          if (owner) await tick(env, owner.id)
        } catch (error) {
          console.error('sync failure', error instanceof Error ? error.name : 'unknown')
        }
      })(),
    )
  },
} satisfies ExportedHandler<Env>
