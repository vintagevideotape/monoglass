import { allocate, envelopeUsage } from '../domain/budget'
import { isAheadOfPace, monthPace } from '../domain/calc'
import type { Envelope, EnvelopePlan, Kopecks, Operation } from '../domain/types'

export type EnvelopeView = Envelope & { plan: EnvelopePlan; ahead: boolean; share: number }

/** Конверты месяца: лимит из раскладки, расход из операций. */
export function envelopeViews(operations: Operation[], plans: EnvelopePlan[], income: Kopecks, now: Date) {
  const allocation = allocate(income, plans)
  const usage = envelopeUsage(operations, plans, now.getFullYear(), now.getMonth())
  const pace = monthPace(now)
  const views: EnvelopeView[] = plans.map((plan) => {
    const envelope: Envelope = {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      limit: allocation.limits[plan.id],
      used: plan.kind === 'spend' ? usage[plan.id] : 0,
      paced: plan.paced,
    }
    const share = envelope.limit > 0 ? Math.min(1, Math.max(0, envelope.used / envelope.limit)) : 0
    return { ...envelope, plan, share, ahead: isAheadOfPace(envelope, pace) }
  })
  return { views, allocation, pace }
}
