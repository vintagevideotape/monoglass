// Сквозная проверка на локальном воркере и подставном банке:
// перенос таблицы → загрузка истории → повторный перенос → сверка. Запуск: npm run e2e (нужны wrangler dev и mock-mono).
import { legacyRows } from '../src/domain/legacyRows'

const API = process.env.API ?? 'http://127.0.0.1:8787'
const MOCK = process.env.MOCK ?? 'http://127.0.0.1:8799'

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${API}/api${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`)
  return data as any
}

function check(name: string, ok: boolean, detail: unknown = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail === '' ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  if (!ok) process.exitCode = 1
}

async function importRows(rows: ReturnType<typeof legacyRows>) {
  const total = { added: 0, matchedById: 0, matchedByFingerprint: 0, known: 0 }
  for (let i = 0; i < rows.length; i += 250) {
    const result = await call('POST', '/legacy/import', { rows: rows.slice(i, i + 250) })
    for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += result[key]
  }
  return total
}

const stats = await (await fetch(`${MOCK}/stats`)).json()
const rows = legacyRows(await (await fetch(`${MOCK}/legacy.csv`)).text())
const sheetOnly = rows.filter((row) => row.id.startsWith('only-sheet')).length
console.log(`банк: ${stats.total} операций (${stats.settled} без блокировок), таблица: ${rows.length} строк, из них ${sheetOnly} только в таблице`)

// 1. Половина таблицы — до загрузки выписки.
const half = Math.floor(rows.length / 2)
const first = await importRows(rows.slice(0, half))
check('первая половина таблицы принята', first.added === half, first)

// 2. Синхронизация до пустой очереди.
let steps = 0
for (; steps < 80; steps += 1) {
  const result = await call('POST', '/sync/now')
  const state = await call('GET', '/state?since=1')
  if (result.action === 'update' && state.sync.jobs.pending === 0 && steps > 3) break
}
let state = await call('GET', '/state')
check('очередь истории пуста, ошибок нет', state.sync.jobs.pending === 0 && state.sync.jobs.failed === 0 && state.sync.error === '', state.sync)
check('счета: две гривневые карты синхронизируются, долларовая — нет', state.accounts.filter((a: any) => a.source === 'mono' && a.sync === 1).length === 2 && state.accounts.some((a: any) => a.currency === 840 && a.source === 'mono' && a.sync === 0))
check('наличные счета и регулярные платежи заведены', state.accounts.filter((a: any) => a.source === 'cash').length === 2 && state.recurring.length === 2)

// 3. Вторая половина — после выписки, затем вся таблица ещё раз.
const second = await importRows(rows.slice(half))
check('вторая половина нашла пары в выписке', second.matchedById + second.matchedByFingerprint === rows.length - half - rows.slice(half).filter((r) => r.id.startsWith('only-sheet')).length, second)
const again = await importRows(rows)
check('повторный перенос ничего не меняет', again.added === 0 && again.matchedById === 0 && again.matchedByFingerprint === 0, again)

// 4. Ещё несколько шагов синхронизации: перечитывание не должно ничего менять.
await call('POST', '/sync/now')
await call('POST', '/sync/now')

const report = await call('GET', '/legacy/report')
await new Promise((resolve) => setTimeout(resolve, 2500))
state = await call('GET', '/state')
const bank = state.ops.filter((op: any) => op.source === 'mono')
const ids = new Set(state.ops.map((op: any) => op.id))
check('в базе все операции банка, по одной', bank.length === stats.total && ids.size === state.ops.length, { bank: bank.length, expected: stats.total })
check('строки таблицы: потерь нет', report.legacyTotal === rows.length, { legacyTotal: report.legacyTotal, rows: rows.length })
check('без пары остались только строки, которых нет в банке', report.unmatched === sheetOnly, { unmatched: report.unmatched })
check('возможных дублей нет', report.possibleDuplicates === 0, report.possibleDuplicates)
check('всего операций = банк + только-таблица', state.ops.length === stats.total + sheetOnly, state.ops.length)
const sum = (list: any[]) => list.reduce((t, r) => t + r.amount, 0)
check('суммы перенесённых строк совпали с таблицей', report.legacyIn - report.legacyOut === sum(rows), { base: report.legacyIn - report.legacyOut, sheet: sum(rows) })
check('разметка таблицы перешла на операции банка', bank.filter((op: any) => op.legacy_category !== null).length === rows.length - sheetOnly)
check('карта восстановлена у всех операций банка', bank.every((op: any) => op.account_id.startsWith('acc-')))

// 5. Ручной ввод и регулярный платёж.
await call('PUT', '/recurring/rent', { name: 'Аренда', amount: 1500000, day: 5, category: 'Жильё', account_id: 'cash-uah' })
await call('PATCH', '/accounts/cash-uah', { opening_balance: 2000000 })
const paid = await call('POST', '/ops', { account_id: 'cash-uah', amount: -1500000, description: 'Аренда', category: 'Жильё', recurring_id: 'rent', period: '2026-11' })
await call('PATCH', `/ops/${encodeURIComponent(bank[0].id)}`, { kind: 'project', category: 'Проектные расходы' })
const delta = await call('GET', `/state?since=${state.serverTime}`)
check('изменения приходят дельтой', delta.ops.length === 2 && delta.ops.some((op: any) => op.id === paid.id) && delta.ops.some((op: any) => op.set_kind === 'project'), delta.ops.length)
check('аренда настраивается', delta.recurring.find((r: any) => r.id === 'rent').amount === 1500000)
const denied = await fetch(`${API}/api/ops/${encodeURIComponent(bank[0].id)}`, { method: 'DELETE' })
check('операцию банка удалить нельзя', denied.status === 400)

const mock = await (await fetch(`${MOCK}/stats`)).json()
console.log(`запросов к банку: ${mock.requests}, шагов синхронизации: ${steps + 3}`)
