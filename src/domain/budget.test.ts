import { describe, expect, it } from 'vitest'
import { allocate, envelopeUsage, unassignedCategories } from './budget'
import { importSheet } from './importSheet'
import type { EnvelopePlan } from './types'

const plan = (id: string, allocation: EnvelopePlan['allocation'], categories: string[] = []): EnvelopePlan => ({
  id,
  name: id,
  kind: 'spend',
  allocation,
  categories,
  paced: true,
})

describe('раскладка дохода по конвертам', () => {
  it('фиксированные суммы — первыми, проценты — от остатка', () => {
    const result = allocate(4200000, [
      plan('fixed', { type: 'fixed', amount: 1200000 }),
      plan('needs', { type: 'percent', percent: 50 }),
      plan('fun', { type: 'percent', percent: 20 }),
      plan('cushion', { type: 'percent', percent: 30 }),
    ])
    expect(result.limits).toEqual({ fixed: 1200000, needs: 1500000, fun: 600000, cushion: 900000 })
    expect(result.unallocated).toBe(0)
    expect(result.problems).toEqual([])
  })

  it('показывает нераспределённый остаток', () => {
    const result = allocate(1000000, [plan('a', { type: 'percent', percent: 60 })])
    expect(result.unallocated).toBe(400000)
  })

  it('сообщает, когда план не сходится', () => {
    expect(allocate(100000, [plan('a', { type: 'fixed', amount: 150000 })]).problems).toEqual(['Фиксированные суммы больше дохода'])
    expect(allocate(100000, [plan('a', { type: 'percent', percent: 70 }), plan('b', { type: 'percent', percent: 50 })]).problems).toEqual([
      'Проценты в сумме больше 100',
    ])
  })
})

const SHEET = [
  'ID,Date and time,Description,MCC,Amount UAH,Account,Category,Subcategory,IsProject,IsTransfer',
  'a1,03.11.2026 09:12,Магазин,5411,-400,Чёрная,Продукты,Супермаркеты,FALSE,FALSE',
  'a2,04.11.2026 09:12,Скасування. Магазин,5411,100,Чёрная,Продукты,Супермаркеты,FALSE,FALSE',
  'a3,05.11.2026 09:12,Кафе,5814,-250,Чёрная,Кафе и рестораны,Рестораны,FALSE,FALSE',
  'a4,05.11.2026 10:12,Аптека,5912,-90,Чёрная,Здоровье,Аптеки и клиники,FALSE,FALSE',
  'a5,05.11.2026 11:12,Від: Близкий Человек,4829,995,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a6,05.11.2026 12:12,Від: Заказчик Проекта,4829,5000,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a7,05.11.2026 13:12,Від: Кто-то Ещё,4829,300,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
].join('\n')

describe('расход по конвертам', () => {
  const plans = [plan('needs', { type: 'percent', percent: 60 }, ['Продукты']), plan('fun', { type: 'percent', percent: 40 }, ['Кафе и рестораны'])]
  const ops = importSheet(SHEET)

  it('считает по категориям конверта, возврат уменьшает расход', () => {
    expect(envelopeUsage(ops, plans, 2026, 10)).toEqual({ needs: 30000, fun: 25000 })
  })

  it('находит категории без конверта', () => {
    expect(unassignedCategories(ops, plans)).toEqual(['Здоровье'])
  })
})

describe('правила контрагентов', () => {
  it('перевод от человека получает вид по правилу отправителя', () => {
    const ops = importSheet(SHEET, [
      { sender: 'Близкий Человек', as: 'support' },
      { sender: 'заказчик проекта', as: 'project' },
    ])
    const kind = (id: string) => ops.find((op) => op.id === id)?.kind
    expect(kind('a5')).toBe('support')
    expect(kind('a6')).toBe('project')
    expect(kind('a7')).toBe('personIncoming')
  })
})
