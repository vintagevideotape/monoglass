import type { Operation, OperationKind } from './types'

/**
 * Ручная правка одной операции. Сильнее любых правил: что человек разметил руками, то и остаётся.
 * Так раскладываются переводы от людей и на карты, списания Apple и всё, что правила не угадали.
 */
export type OperationOverride = {
  id: string
  kind?: OperationKind
  category?: string
  subcategory?: string
}

export function applyOverrides(operations: Operation[], overrides: OperationOverride[]): Operation[] {
  const byId = new Map(overrides.map((o) => [o.id, o]))
  return operations.map((op) => {
    const override = byId.get(op.id)
    if (!override) return op
    return {
      ...op,
      kind: override.kind ?? op.kind,
      category: override.category ?? op.category,
      subcategory: override.subcategory ?? op.subcategory,
    }
  })
}
