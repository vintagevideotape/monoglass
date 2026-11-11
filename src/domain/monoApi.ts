/** Формы ответов Monobank Open API (personal) и перевод их в строки базы. */

export type MonoAccount = {
  id: string
  currencyCode: number
  balance: number
  creditLimit: number
  type: string
  maskedPan?: string[]
  iban?: string
}

export type MonoJar = { id: string; title: string; currencyCode: number; balance: number; goal?: number | null }

export type MonoClientInfo = { clientId?: string; name?: string; accounts?: MonoAccount[]; jars?: MonoJar[] }

export type MonoStatementItem = {
  id: string
  time: number
  description?: string
  mcc?: number
  originalMcc?: number
  hold?: boolean
  amount: number
  operationAmount?: number
  currencyCode?: number
  commissionRate?: number
  cashbackAmount?: number
  balance?: number
  comment?: string
  counterName?: string
}

/** Больше банк за один запрос не отдаёт: 31 сутки + 1 час. */
export const MAX_WINDOW = 2_682_000
/** Столько операций банк возвращает за раз; ровно столько — значит, есть ещё. */
export const PAGE_SIZE = 500

/** Режет период на окна допустимой длины, от новых к старым. */
export function statementWindows(from: number, to: number): { from: number; to: number }[] {
  const windows: { from: number; to: number }[] = []
  let end = to
  while (end > from) {
    const start = Math.max(from, end - MAX_WINDOW)
    windows.push({ from: start, to: end })
    end = start
  }
  return windows
}

const CARD_NAMES: Record<string, string> = {
  black: 'Mono чёрная',
  white: 'Mono белая',
  platinum: 'Mono Platinum',
  iron: 'Mono Iron',
  yellow: 'Mono детская',
  eAid: 'еПідтримка',
  fop: 'ФОП',
}

export function accountName(account: MonoAccount): string {
  const base = CARD_NAMES[account.type] ?? `Mono ${account.type}`
  const tail = account.maskedPan?.[0]?.slice(-4)
  return tail ? `${base} ·${tail}` : base
}

export const UAH = 980

export type MonoOpFields = {
  id: string
  at: number
  description: string
  mcc: string
  amount: number
  currency: number
  operation_amount: number
  operation_currency: number
  balance: number | null
  hold: number
  cashback: number
  commission: number
  comment: string
  counter_name: string
}

export function itemToFields(item: MonoStatementItem, accountCurrency: number): MonoOpFields {
  return {
    id: item.id,
    at: item.time,
    description: item.description ?? '',
    mcc: item.mcc === undefined ? '' : String(item.mcc),
    amount: item.amount,
    currency: accountCurrency,
    operation_amount: item.operationAmount ?? item.amount,
    operation_currency: item.currencyCode ?? accountCurrency,
    balance: item.balance ?? null,
    hold: item.hold ? 1 : 0,
    cashback: item.cashbackAmount ?? 0,
    commission: item.commissionRate ?? 0,
    comment: item.comment ?? '',
    counter_name: item.counterName ?? '',
  }
}
