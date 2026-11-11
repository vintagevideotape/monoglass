import { describe, expect, it } from 'vitest'
import { importSheet } from './importSheet'
import { applyCategoryRules, DEFAULT_RULES } from './rules'

const SHEET = [
  'ID,Date and time,Description,MCC,Amount UAH,Account,Category,Subcategory,IsProject,IsTransfer',
  'a1,03.11.2026 09:12,Vodafone,4814,-180,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a2,03.11.2026 10:12,537541****1234,4829,-1500,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a3,03.11.2026 11:12,Неизвестный магазин,5999,-300,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a4,03.11.2026 12:12,Rozetka,5732,-900,Чёрная,Покупки и техника,Рассрочка,FALSE,FALSE',
  'a5,03.11.2026 13:12,Vodafone,4814,-180,Чёрная,Покупки и разное,Общие расходы,TRUE,FALSE',
].join('\n')

describe('правила категорий', () => {
  const ops = applyCategoryRules(importSheet(SHEET), DEFAULT_RULES)
  const category = (id: string) => ops.find((op) => op.id === id)?.category

  it('разбирают сборную категорию', () => {
    expect(category('a1')).toBe('Связь')
    expect(category('a2')).toBe('Переводы людям')
  })

  it('не трогают нераспознанное, уже разобранное и проектное', () => {
    expect(category('a3')).toBe('Покупки и разное')
    expect(category('a4')).toBe('Покупки и техника')
    expect(category('a5')).toBe('Покупки и разное')
  })

  it('правило без условий не срабатывает', () => {
    const result = applyCategoryRules(importSheet(SHEET), [{ category: 'Всё', subcategory: 'Всё' }])
    expect(result.every((op) => op.category !== 'Всё')).toBe(true)
  })
})
