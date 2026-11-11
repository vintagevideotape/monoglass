import type { Operation } from './types'

/** Правило категории: первое совпавшее выигрывает. Все условия правила должны выполняться. */
export type CategoryRule = {
  /** Подстрока описания, без учёта регистра. */
  descriptionIncludes?: string
  /** Регулярное выражение по описанию. */
  descriptionMatches?: RegExp
  mcc?: string
  category: string
  subcategory: string
}

/**
 * Базовые правила для общеизвестных продавцов. Разбирают сборную категорию старой таблицы.
 * Правила с именами людей сюда не попадают: они личные и хранятся вместе с данными.
 */
export const DEFAULT_RULES: CategoryRule[] = [
  { descriptionMatches: /^\d{6}\*+\d{4}$/, category: 'Переводы людям', subcategory: 'На карту' },
  { descriptionIncludes: 'Vodafone', category: 'Связь', subcategory: 'Мобильная связь' },
  { descriptionIncludes: 'Київстар', category: 'Связь', subcategory: 'Мобильная связь' },
  { descriptionIncludes: 'lifecell', category: 'Связь', subcategory: 'Мобильная связь' },
  { descriptionIncludes: 'MEGOGO', category: 'Подписки и сервисы', subcategory: 'Видео и музыка' },
  { descriptionIncludes: 'Нова пошта', category: 'Покупки', subcategory: 'Доставка' },
  { descriptionIncludes: 'Укрпошта', category: 'Покупки', subcategory: 'Доставка' },
  { descriptionIncludes: 'Rozetka', category: 'Покупки', subcategory: 'Маркетплейсы' },
  { descriptionIncludes: 'Temu', category: 'Покупки', subcategory: 'Маркетплейсы' },
  { descriptionIncludes: 'AliExpress', category: 'Покупки', subcategory: 'Маркетплейсы' },
  { descriptionIncludes: 'ANSWEAR', category: 'Покупки', subcategory: 'Одежда' },
  { descriptionIncludes: 'Епіцентр', category: 'Дом', subcategory: 'Товары для дома' },
]

function matches(op: Operation, rule: CategoryRule): boolean {
  if (rule.mcc !== undefined && op.mcc !== rule.mcc) return false
  if (rule.descriptionIncludes !== undefined && !op.description.toLowerCase().includes(rule.descriptionIncludes.toLowerCase())) return false
  if (rule.descriptionMatches !== undefined && !rule.descriptionMatches.test(op.description.trim())) return false
  return rule.mcc !== undefined || rule.descriptionIncludes !== undefined || rule.descriptionMatches !== undefined
}

/**
 * Перекатегоризирует личные расходы и возвраты по правилам.
 * По умолчанию трогает только сборную подкатегорию — то, что старые правила не распознали.
 */
export function applyCategoryRules(operations: Operation[], rules: CategoryRule[], onlySubcategory: string | null = 'Общие расходы'): Operation[] {
  return operations.map((op) => {
    if (op.kind !== 'expense' && op.kind !== 'refund') return op
    if (onlySubcategory !== null && op.subcategory !== onlySubcategory) return op
    const rule = rules.find((r) => matches(op, r))
    return rule ? { ...op, category: rule.category, subcategory: rule.subcategory } : op
  })
}
