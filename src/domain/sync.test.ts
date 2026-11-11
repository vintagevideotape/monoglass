import { describe, expect, it } from 'vitest'
import { kyivPeriod, kyivToEpoch, sheetDateToEpoch } from './kyiv'
import { matchLegacy } from './match'
import { categoryByMcc, UNSORTED } from './mcc'
import { itemToFields, MAX_WINDOW, statementWindows } from './monoApi'
import { cashBalance, toOperation, toOperations } from './raw'
import { DEFAULT_RULES } from './rules'
import type { AccountRow, OpRow } from './raw'
import { recurringMonthly, recurringStatus } from './recurring'
import type { Recurring } from './recurring'

const row = (patch: Partial<OpRow>): OpRow => ({
  id: 'x',
  source: 'mono',
  account_id: 'card',
  at: 0,
  description: '',
  mcc: '',
  amount: 0,
  currency: 980,
  balance: null,
  hold: 0,
  comment: '',
  counter_name: '',
  legacy_id: null,
  legacy_account: null,
  legacy_category: null,
  legacy_subcategory: null,
  legacy_project: 0,
  legacy_transfer: 0,
  set_kind: null,
  set_category: null,
  set_subcategory: null,
  note: '',
  recurring_id: null,
  period: null,
  updated_at: 0,
  deleted: 0,
  ...patch,
})

describe('киевское время', () => {
  it('учитывает зимнее и летнее время', () => {
    expect(kyivToEpoch(2026, 11, 8, 14, 49)).toBe(Date.UTC(2026, 10, 8, 12, 49) / 1000)
    expect(kyivToEpoch(2026, 7, 1, 9, 0)).toBe(Date.UTC(2026, 6, 1, 6, 0) / 1000)
    expect(sheetDateToEpoch('08.11.2026 14:49')).toBe(Date.UTC(2026, 10, 8, 12, 49) / 1000)
  })

  it('относит полночь к правильному месяцу', () => {
    expect(kyivPeriod(Date.UTC(2026, 9, 31, 22, 30) / 1000)).toBe('2026-11')
    expect(kyivPeriod(Date.UTC(2026, 9, 31, 21, 30) / 1000)).toBe('2026-10')
  })
})

describe('окна выписки', () => {
  it('режет год на окна не длиннее допустимого, от новых к старым, без дыр', () => {
    const to = 1_800_000_000
    const from = to - 400 * 86400
    const windows = statementWindows(from, to)
    expect(windows[0].to).toBe(to)
    expect(windows.at(-1)?.from).toBe(from)
    expect(windows.every((w) => w.to - w.from <= MAX_WINDOW)).toBe(true)
    expect(windows.every((w, i) => i === 0 || w.to === windows[i - 1].from)).toBe(true)
    expect(windows).toHaveLength(13)
  })

  it('переводит операцию банка в поля базы', () => {
    const fields = itemToFields({ id: 'abc', time: 100, description: 'Сільпо', mcc: 5411, amount: -48650, balance: 100000, hold: true }, 980)
    expect(fields).toMatchObject({ id: 'abc', at: 100, mcc: '5411', amount: -48650, hold: 1, balance: 100000, currency: 980 })
  })
})

describe('склейка старой таблицы с выпиской', () => {
  const legacy = [
    { id: 'same', at: 1000, amount: -5000, description: 'Магазин' },
    { id: 'old-1', at: 6000, amount: -13200, description: 'Bolt' },
    { id: 'old-2', at: 6000, amount: -13200, description: 'Uklon' },
    { id: 'old-3', at: 9000, amount: 100000, description: 'З Білої картки' },
    { id: 'lonely', at: 20000, amount: -700, description: 'Кофе' },
  ]
  const mono = [
    { id: 'same', at: 1017, amount: -5000, description: 'Магазин' },
    { id: 'm-uklon', at: 6042, amount: -13200, description: 'Uklon' },
    { id: 'm-bolt', at: 6010, amount: -13200, description: 'Bolt' },
    { id: 'm-other-sign', at: 9005, amount: -100000, description: 'На чорну картку' },
    { id: 'm-new', at: 30000, amount: -700, description: 'Кофе' },
  ]
  const pairs = matchLegacy(mono, legacy)
  const find = (monoId: string) => pairs.find((pair) => pair.monoId === monoId)

  it('сначала по ID, затем по сумме и времени', () => {
    expect(find('same')).toEqual({ monoId: 'same', legacyId: 'same', by: 'id' })
    expect(find('m-bolt')?.legacyId).toBe('old-1')
    expect(find('m-uklon')?.legacyId).toBe('old-2')
  })

  it('не путает знак суммы и далёкие по времени операции', () => {
    expect(find('m-other-sign')).toBeUndefined()
    expect(find('m-new')).toBeUndefined()
  })

  it('в ночь перевода часов находит пару в любом из двух одинаковых часов', () => {
    // 25.10.2026 03:30 по Киеву бывает дважды: 00:30 и 01:30 UTC.
    const early = Date.UTC(2026, 9, 25, 0, 30) / 1000
    const fromSheet = kyivToEpoch(2026, 10, 25, 3, 30)
    const other = fromSheet === early ? early + 3600 : early
    expect(matchLegacy([{ id: 'm', at: other + 12, amount: -100, description: 'x' }], [{ id: 'l', at: fromSheet, amount: -100, description: 'x' }])).toHaveLength(1)
    // В обычный день сдвиг на час — это другая операция.
    expect(matchLegacy([{ id: 'm', at: 1_790_000_000 + 3612, amount: -100, description: 'x' }], [{ id: 'l', at: 1_790_000_000, amount: -100, description: 'x' }])).toHaveLength(0)
  })

  it('каждая строка таблицы используется один раз', () => {
    const twins = matchLegacy(
      [
        { id: 'a', at: 100, amount: -100, description: 'x' },
        { id: 'b', at: 110, amount: -100, description: 'x' },
      ],
      [{ id: 'l', at: 60, amount: -100, description: 'x' }],
    )
    expect(twins).toHaveLength(1)
  })
})

describe('строка базы → операция', () => {
  it('новая операция из банка получает категорию по MCC', () => {
    const op = toOperation(row({ mcc: '5411', amount: -100, description: 'АТБ' }))
    expect(op.kind).toBe('expense')
    expect(op.category).toBe('Продукты')
    expect(categoryByMcc('9999')).toEqual(UNSORTED)
  })

  it('разметка из таблицы сильнее MCC, ручная — сильнее всего', () => {
    const annotated = row({ mcc: '5411', amount: -100, legacy_category: 'Проектные расходы', legacy_subcategory: '', legacy_project: 1 })
    expect(toOperation(annotated).kind).toBe('project')
    expect(toOperation({ ...annotated, set_kind: 'expense', set_category: 'Продукты' })).toMatchObject({ kind: 'expense', category: 'Продукты' })
  })

  it('узнаёт переводы между своими картами и пополнения через терминал', () => {
    expect(toOperation(row({ amount: 100000, description: 'З Білої картки', mcc: '4829' })).kind).toBe('transfer')
    expect(toOperation(row({ amount: -100000, description: 'На чорну картку', mcc: '4829' })).kind).toBe('transfer')
    expect(toOperation(row({ amount: 200000, description: 'Термінал City24', mcc: '6012' })).kind).toBe('cashTopUp')
  })

  it('правила разбирают сборную категорию, но не трогают ручную разметку', () => {
    const rows = [
      row({ id: 'a', mcc: '4215', amount: -12000, description: 'Нова пошта' }),
      row({ id: 'b', mcc: '4215', amount: -12000, description: 'Нова пошта', set_category: 'Проектные расходы', set_subcategory: '' }),
      row({ id: 'c', mcc: '4829', amount: 50000, description: 'Від: Имя Фамилия' }),
      row({ id: 'gone', mcc: '5411', amount: -1, deleted: 1 }),
    ]
    const ops = toOperations(rows, new Map(), DEFAULT_RULES, [{ sender: 'имя фамилия', as: 'project' }])
    expect(ops.map((op) => op.id)).toEqual(['a', 'b', 'c'])
    expect(ops[0]).toMatchObject({ category: 'Покупки', subcategory: 'Доставка' })
    expect(ops[1].category).toBe('Проектные расходы')
    expect(ops[2].kind).toBe('project')
  })

  it('подставляет название счёта', () => {
    expect(toOperation(row({ account_id: 'card' }), new Map([['card', 'Mono чёрная']])).account).toBe('Mono чёрная')
  })
})

describe('наличные', () => {
  const cash: AccountRow = { id: 'cash', source: 'cash', name: 'Наличные ₴', type: 'cash', currency: 980, balance: 0, credit_limit: 0, opening_balance: 500000, opened_at: 1000, masked_pan: '', sync: 0, synced_to: 0, checked_at: 0, archived: 0 }
  const rows = [
    row({ id: 'm1', source: 'manual', account_id: 'cash', amount: 4000000, at: 2000, set_kind: 'income' }),
    row({ id: 'm2', source: 'manual', account_id: 'cash', amount: -1500000, at: 2500, set_kind: 'expense' }),
    row({ id: 't1', amount: 1000000, at: 3000, description: 'Термінал City24' }),
    row({ id: 't0', amount: 700000, at: 500, description: 'Термінал City24' }),
    row({ id: 'gone', source: 'manual', account_id: 'cash', amount: -99, at: 2600, deleted: 1 }),
  ]

  it('складывает ручные операции и вычитает пополнения карты после заведения счёта', () => {
    expect(cashBalance(cash, rows, true)).toBe(500000 + 4000000 - 1500000 - 1000000)
    expect(cashBalance(cash, rows, false)).toBe(500000 + 4000000 - 1500000)
  })
})

describe('регулярные платежи', () => {
  const base: Recurring = { id: 'rent', name: 'Аренда', amount: 1500000, currency: 980, day: 5, category: 'Жильё', account_id: 'cash', variable: 0, active: 1 }
  const utilities: Recurring = { ...base, id: 'util', name: 'Коммуналка', amount: 0, day: 20, variable: 1 }
  const off: Recurring = { ...base, id: 'off', active: 0 }
  const now = kyivToEpoch(2026, 11, 11, 17, 0)

  it('показывает оплату, просрочку и незаданную сумму', () => {
    const paid = row({ id: 'p', source: 'manual', amount: -1500000, recurring_id: 'rent', period: '2026-11' })
    const [rent, util] = recurringStatus([base, utilities, off], [paid], now)
    expect(rent).toMatchObject({ state: 'paid', paid: 1500000, period: '2026-11' })
    expect(util.state).toBe('unset')
    expect(recurringStatus([base], [], now)[0]).toMatchObject({ state: 'overdue', daysLeft: -6 })
    expect(recurringStatus([{ ...base, day: 13 }], [], now)[0].state).toBe('due')
    expect(recurringStatus([{ ...base, day: 25 }], [], now)[0].state).toBe('upcoming')
  })

  it('оплата прошлого месяца не закрывает текущий', () => {
    const old = row({ id: 'p', source: 'manual', amount: -1500000, recurring_id: 'rent', period: '2026-10' })
    expect(recurringStatus([base], [old], now)[0].state).toBe('overdue')
  })

  it('считает месячный план только по активным', () => {
    expect(recurringMonthly([base, utilities, off])).toBe(1500000)
  })
})
