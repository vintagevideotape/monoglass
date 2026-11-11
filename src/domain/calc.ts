import { sum } from './money'
import type { AccountBalance, Envelope, Kopecks, Operation, OperationKind, ProjectWallet } from './types'

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

/** Доля месяца, прошедшая к этому дню: 11 ноября → 11/30. */
export function monthPace(date: Date): number {
  return date.getDate() / daysInMonth(date)
}

/** Запас, в пределах которого опережение темпа не считается проблемой (10 п.п. лимита). */
export const PACE_TOLERANCE = 0.1

export function isAheadOfPace(envelope: Envelope, pace: number, tolerance = PACE_TOLERANCE): boolean {
  if (!envelope.paced || envelope.kind !== 'spend' || envelope.limit <= 0) return false
  return envelope.used / envelope.limit > pace + tolerance
}

/** Сколько можно тратить в день до конца месяца, считая сегодняшний день. */
export function dailyAllowance(remaining: Kopecks, date: Date): Kopecks {
  const daysLeft = daysInMonth(date) - date.getDate() + 1
  return remaining <= 0 ? 0 : Math.floor(remaining / daysLeft)
}

/** Свои деньги: остатки без кредитного лимита минус проектные остатки, которые лежат на тех же счетах. */
export function honestBalance(accounts: AccountBalance[], projects: ProjectWallet[]): Kopecks {
  return sum(accounts.map((a) => a.balance)) - sum(projects.map((p) => p.remainder))
}

export type MonthSummary = {
  count: number
  /** Личные расходы за вычетом возвратов, положительным числом. */
  spent: Kopecks
  income: Kopecks
  /** Переводы от людей, для которых ещё нет правила. */
  personIncoming: Kopecks
  /** Деньги от близких. */
  support: Kopecks
  cashTopUps: Kopecks
  projectIn: Kopecks
  projectOut: Kopecks
  byKind: Record<OperationKind, Kopecks>
}

const KINDS: OperationKind[] = ['expense', 'refund', 'income', 'personIncoming', 'support', 'cashTopUp', 'jar', 'transfer', 'project']

export function monthSummary(operations: Operation[], year: number, monthIndex: number): MonthSummary {
  const inMonth = operations.filter((op) => op.at.getFullYear() === year && op.at.getMonth() === monthIndex)
  const byKind = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<OperationKind, Kopecks>
  for (const op of inMonth) byKind[op.kind] += op.amount
  const project = inMonth.filter((op) => op.kind === 'project')
  return {
    count: inMonth.length,
    spent: 0 - (byKind.expense + byKind.refund),
    income: byKind.income,
    personIncoming: byKind.personIncoming,
    support: byKind.support,
    cashTopUps: byKind.cashTopUp,
    projectIn: sum(project.filter((op) => op.amount > 0).map((op) => op.amount)),
    projectOut: 0 - sum(project.filter((op) => op.amount < 0).map((op) => op.amount)),
    byKind,
  }
}

/** Личные расходы по категориям за месяц, по убыванию. Возвраты уменьшают свою категорию. */
export function spendByCategory(operations: Operation[], year: number, monthIndex: number): { category: string; spent: Kopecks }[] {
  const totals = new Map<string, Kopecks>()
  for (const op of operations) {
    if (op.at.getFullYear() !== year || op.at.getMonth() !== monthIndex) continue
    if (op.kind !== 'expense' && op.kind !== 'refund') continue
    totals.set(op.category, (totals.get(op.category) ?? 0) - op.amount)
  }
  return [...totals].map(([category, spent]) => ({ category, spent })).sort((a, b) => b.spent - a.spent)
}
