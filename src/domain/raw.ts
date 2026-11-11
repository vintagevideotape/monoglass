import { applyCounterpartyRule, classify } from './classify'
import { categoryByMcc } from './mcc'
import { applyCategoryRules } from './rules'
import type { CategoryRule } from './rules'
import type { CounterpartyRule, Operation, OperationKind } from './types'

/** Строка операции в базе. Те же поля приходят в приложение. Деньги — в копейках, время — unix-секунды. */
export type OpRow = {
  id: string
  /** mono — из банка, legacy — из старой таблицы (пары в выписке пока нет), manual — внесена руками. */
  source: 'mono' | 'legacy' | 'manual'
  account_id: string
  at: number
  description: string
  mcc: string
  amount: number
  currency: number
  balance: number | null
  hold: number
  comment: string
  counter_name: string
  /** Разметка, перенесённая из старой таблицы. */
  legacy_id: string | null
  legacy_account: string | null
  legacy_category: string | null
  legacy_subcategory: string | null
  legacy_project: number
  legacy_transfer: number
  /** Ручная разметка: сильнее любых правил. Для ручных операций заполнена сразу. */
  set_kind: OperationKind | null
  set_category: string | null
  set_subcategory: string | null
  note: string
  recurring_id: string | null
  period: string | null
  updated_at: number
  deleted: number
}

export type AccountRow = {
  id: string
  source: 'mono' | 'cash'
  name: string
  type: string
  currency: number
  /** Для карт — остаток вместе с кредитным лимитом, как отдаёт банк. Для наличных не используется. */
  balance: number
  credit_limit: number
  /** Наличные: сколько было на счёте в момент заведения. */
  opening_balance: number
  opened_at: number
  masked_pan: string
  sync: number
  synced_to: number
  checked_at: number
  archived: number
}

/** Переводы между своими картами в выписке банка: «З Білої картки», «На чорну картку». */
const OWN_CARD = /^(З|На) (чорн|біл|платинов|залізн|iron|гривнев|валютн|доларов|євро)\S* картк[иу]/i

/** Строка базы → операция расчётного ядра. Категорию и вид определяет код, ручная разметка — поверх. */
export function toOperation(row: OpRow, accountNames: Map<string, string> = new Map()): Operation {
  const annotated = row.legacy_category !== null
  const auto = annotated
    ? { category: row.legacy_category ?? '', subcategory: row.legacy_subcategory ?? '' }
    : row.source === 'manual'
      ? { category: '', subcategory: '' }
      : categoryByMcc(row.mcc)
  const kind =
    row.set_kind ??
    classify({
      description: row.description,
      mcc: row.mcc,
      amount: row.amount,
      isProject: row.legacy_project === 1,
      isTransfer: annotated ? row.legacy_transfer === 1 : OWN_CARD.test(row.description.trim()),
    })
  return {
    id: row.id,
    at: new Date(row.at * 1000),
    description: row.description,
    mcc: row.mcc,
    amount: row.amount,
    account: accountNames.get(row.account_id) ?? row.legacy_account ?? '',
    category: row.set_category ?? auto.category,
    subcategory: row.set_subcategory ?? auto.subcategory,
    kind,
  }
}

/** Свои деньги на карте: остаток без кредитного лимита. */
export function ownBalance(account: AccountRow): number {
  return account.balance - account.credit_limit
}

/**
 * Остаток наличного счёта: стартовая сумма плюс всё, что внесено руками.
 * Пополнения карты через терминал уменьшают гривневые наличные — это те же деньги, переложенные на карту.
 */
export function cashBalance(account: AccountRow, rows: OpRow[], feedsTopUps: boolean): number {
  let total = account.opening_balance
  for (const row of rows) {
    if (row.deleted) continue
    if (row.account_id === account.id) total += row.amount
    else if (feedsTopUps && row.source !== 'manual' && row.at >= account.opened_at && row.amount > 0 && toOperation(row).kind === 'cashTopUp') total -= row.amount
  }
  return total
}

/**
 * Все строки базы → операции для расчётов. Порядок важен:
 * автоматическая категория → правила → ручная разметка. Что размечено руками, правила не трогают.
 */
export function toOperations(rows: OpRow[], accountNames: Map<string, string>, rules: CategoryRule[] = [], counterparties: CounterpartyRule[] = []): Operation[] {
  const live = rows.filter((row) => !row.deleted)
  const auto = live.map((row) => {
    const op = toOperation({ ...row, set_category: null, set_subcategory: null }, accountNames)
    return row.set_kind ? op : { ...op, kind: applyCounterpartyRule(op.kind, op.description, counterparties) }
  })
  return applyCategoryRules(auto, rules).map((op, index) => ({
    ...op,
    category: live[index].set_category ?? op.category,
    subcategory: live[index].set_subcategory ?? op.subcategory,
  }))
}
