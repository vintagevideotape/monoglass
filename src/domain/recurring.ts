import { kyivParts, kyivPeriod } from './kyiv'
import type { OpRow } from './raw'

/** Регулярный ручной платёж: аренда, коммуналка и всё, чего нет в выписке банка. */
export type Recurring = {
  id: string
  name: string
  /** Плановая сумма в копейках. Ноль — сумма ещё не задана. */
  amount: number
  currency: number
  /** День месяца, к которому платёж должен быть внесён. */
  day: number
  category: string
  /** С какого счёта обычно платится (наличные). */
  account_id: string | null
  /** Сумма меняется от месяца к месяцу (коммуналка): при оплате её уточняют. */
  variable: number
  active: number
}

export type RecurringStatus = {
  recurring: Recurring
  period: string
  /** Сколько внесено за период, положительным числом. */
  paid: number
  state: 'unset' | 'paid' | 'due' | 'overdue' | 'upcoming'
  /** Дней до срока; отрицательное — просрочка. */
  daysLeft: number
}

/** Состояние каждого регулярного платежа в текущем месяце. Оплата — ручная операция с меткой платежа и периода. */
export function recurringStatus(list: Recurring[], rows: OpRow[], nowEpoch: number): RecurringStatus[] {
  const period = kyivPeriod(nowEpoch)
  const today = kyivParts(nowEpoch).day
  return list
    .filter((item) => item.active === 1)
    .map((recurring) => {
      const paid = -rows.filter((row) => !row.deleted && row.recurring_id === recurring.id && row.period === period).reduce((total, row) => total + row.amount, 0)
      const daysLeft = recurring.day - today
      const state: RecurringStatus['state'] = paid > 0 ? 'paid' : recurring.amount === 0 ? 'unset' : daysLeft < 0 ? 'overdue' : daysLeft <= 3 ? 'due' : 'upcoming'
      return { recurring, period, paid, state, daysLeft }
    })
}

/** Плановая сумма регулярных платежей в месяц — обязательная часть конверта «Фикс». */
export function recurringMonthly(list: Recurring[]): number {
  return list.filter((item) => item.active === 1).reduce((total, item) => total + item.amount, 0)
}
