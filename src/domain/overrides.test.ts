import { describe, expect, it } from 'vitest'
import { importSheet } from './importSheet'
import { applyOverrides } from './overrides'

const SHEET = [
  'ID,Date and time,Description,MCC,Amount UAH,Account,Category,Subcategory,IsProject,IsTransfer',
  'a1,03.11.2026 09:12,Від: Имя Фамилия,4829,995,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a2,03.11.2026 10:12,Apple,5818,"-294,50",Чёрная,Подписки и сервисы,Подписки Apple,TRUE,FALSE',
  'a3,03.11.2026 11:12,Магазин,5411,-100,Чёрная,Продукты,Супермаркеты,FALSE,FALSE',
].join('\n')

describe('ручные правки', () => {
  const ops = applyOverrides(importSheet(SHEET), [
    { id: 'a1', kind: 'project' },
    { id: 'a2', category: 'Подписки и сервисы', subcategory: 'Музыка' },
  ])
  const find = (id: string) => ops.find((op) => op.id === id)!

  it('меняют вид и категорию только указанных операций', () => {
    expect(find('a1').kind).toBe('project')
    expect(find('a2').subcategory).toBe('Музыка')
    expect(find('a2').kind).toBe('expense')
    expect(find('a3')).toEqual(importSheet(SHEET).find((op) => op.id === 'a3'))
  })
})
