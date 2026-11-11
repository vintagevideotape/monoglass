import { sum } from './money'
import type { EnvelopePlan, Kopecks, Operation } from './types'

export type AllocationResult = {
  /** Лимит каждого конверта на месяц. */
  limits: Record<string, Kopecks>
  /** Сколько дохода осталось нераспределённым (отрицательное — план больше дохода). */
  unallocated: Kopecks
  problems: string[]
}

/**
 * Раскладывает доход месяца по конвертам.
 * Сначала вычитаются фиксированные суммы, затем остаток делится по процентам.
 * Проценты считаются от остатка после фиксированных — так «100% по процентам» всегда раскладывает всё.
 */
export function allocate(income: Kopecks, plans: EnvelopePlan[]): AllocationResult {
  const problems: string[] = []
  const limits: Record<string, Kopecks> = {}

  const fixedTotal = sum(plans.map((p) => (p.allocation.type === 'fixed' ? p.allocation.amount : 0)))
  const percentTotal = plans.reduce((total, p) => total + (p.allocation.type === 'percent' ? p.allocation.percent : 0), 0)
  if (fixedTotal > income) problems.push('Фиксированные суммы больше дохода')
  if (percentTotal > 100) problems.push('Проценты в сумме больше 100')

  const pool = Math.max(0, income - fixedTotal)
  for (const plan of plans) {
    limits[plan.id] = plan.allocation.type === 'fixed' ? plan.allocation.amount : Math.floor((pool * plan.allocation.percent) / 100)
  }
  return { limits, unallocated: income - sum(Object.values(limits)), problems }
}

/** Сколько списано из каждого конверта за месяц по его категориям. Возвраты уменьшают расход. */
export function envelopeUsage(operations: Operation[], plans: EnvelopePlan[], year: number, monthIndex: number): Record<string, Kopecks> {
  const byCategory = new Map<string, string>()
  for (const plan of plans) for (const category of plan.categories) byCategory.set(category, plan.id)
  const usage: Record<string, Kopecks> = Object.fromEntries(plans.map((p) => [p.id, 0]))
  for (const op of operations) {
    if (op.at.getFullYear() !== year || op.at.getMonth() !== monthIndex) continue
    if (op.kind !== 'expense' && op.kind !== 'refund') continue
    const id = byCategory.get(op.category)
    if (id) usage[id] -= op.amount
  }
  return usage
}

/** Категории с расходами, которые не привязаны ни к одному конверту. */
export function unassignedCategories(operations: Operation[], plans: EnvelopePlan[]): string[] {
  const assigned = new Set(plans.flatMap((p) => p.categories))
  const seen = new Set(operations.filter((op) => op.kind === 'expense').map((op) => op.category))
  return [...seen].filter((category) => !assigned.has(category)).sort()
}
