import { describe, expect, it } from 'vitest'
import { dailyAllowance, honestBalance, isAheadOfPace, monthPace, monthSummary, spendByCategory } from './calc'
import { classify } from './classify'
import { importSheet, parseCsv } from './importSheet'
import { parseAmount } from './money'
import type { Envelope } from './types'

const HEADER = 'ID,Date and time,Description,MCC,Amount UAH,Account,Category,Subcategory,IsProject,IsTransfer'
const SHEET = [
  HEADER,
  'a1,03.11.2026 09:12,Магазин,5411,"-486,50",Чёрная,Продукты,Супермаркеты,FALSE,FALSE',
  'a2,03.11.2026 11:40,Такси,4121,-132,Чёрная,Транспорт,Такси,TRUE,FALSE',
  'a3,04.11.2026 10:00,Apple,5818,"-88,03",Чёрная,Подписки и сервисы,Подписки Apple,TRUE,FALSE',
  'a4,04.11.2026 12:00,Термінал mono,6012,2000,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a5,05.11.2026 12:00,Скасування. Магазин,5411,"86,50",Чёрная,Продукты,Супермаркеты,FALSE,FALSE',
  'a6,05.11.2026 13:00,Від: Имя Фамилия,4829,495,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a7,06.11.2026 13:00,З Білої картки,4829,1000,Чёрная,Покупки и разное,Общие расходы,FALSE,TRUE',
  'a8,06.11.2026 14:00,Поповнення «На ціль»,4829,-500,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a9,06.11.2026 15:00,"Виведення кешбеку 120.00₴",4829,120,Чёрная,Покупки и разное,Общие расходы,FALSE,FALSE',
  'a1,03.11.2026 09:12,Магазин,5411,"-486,50",Чёрная,Продукты,Супермаркеты,FALSE,FALSE',
  'b1,28.10.2026 09:00,Магазин,5411,-100,Чёрная,Продукты,Супермаркеты,FALSE,FALSE',
].join('\n')

describe('деньги', () => {
  it('разбирает суммы в копейки', () => {
    expect(parseAmount('-284,97')).toBe(-28497)
    expect(parseAmount('-13,2')).toBe(-1320)
    expect(parseAmount('495')).toBe(49500)
    expect(parseAmount('1 250,5')).toBe(125050)
    expect(() => parseAmount('abc')).toThrow()
  })
})

describe('импорт', () => {
  it('понимает кавычки и запятые внутри полей', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ])
  })

  it('отбрасывает дубли по ID и сортирует от новых к старым', () => {
    const ops = importSheet(SHEET)
    expect(ops).toHaveLength(10)
    expect(ops[0].id).toBe('a9')
    expect(ops.at(-1)?.id).toBe('b1')
  })
})

describe('классификация', () => {
  const kind = (id: string) => importSheet(SHEET).find((op) => op.id === id)?.kind

  it('исправляет ошибки старых правил', () => {
    expect(kind('a3')).toBe('expense') // Apple был помечен проектным
    expect(kind('a4')).toBe('cashTopUp') // терминал был доходом
  })

  it('различает остальные виды', () => {
    expect(kind('a1')).toBe('expense')
    expect(kind('a2')).toBe('project')
    expect(kind('a5')).toBe('refund')
    expect(kind('a6')).toBe('personIncoming')
    expect(kind('a7')).toBe('transfer')
    expect(kind('a8')).toBe('jar')
    expect(kind('a9')).toBe('income')
    expect(classify({ description: 'Скасування. Uklon', mcc: '4121', amount: 100, isProject: true, isTransfer: false })).toBe('project')
  })
})

describe('расчёты', () => {
  const ops = importSheet(SHEET)

  it('сводка месяца: возврат уменьшает расход, проектные и переводы не входят', () => {
    const november = monthSummary(ops, 2026, 10)
    expect(november.count).toBe(9)
    expect(november.spent).toBe(48650 + 8803 - 8650)
    expect(november.income).toBe(12000)
    expect(november.personIncoming).toBe(49500)
    expect(november.cashTopUps).toBe(200000)
    expect(november.projectOut).toBe(13200)
    expect(monthSummary(ops, 2026, 9).spent).toBe(10000)
  })

  it('расходы по категориям', () => {
    expect(spendByCategory(ops, 2026, 10)).toEqual([
      { category: 'Продукты', spent: 40000 },
      { category: 'Подписки и сервисы', spent: 8803 },
    ])
  })

  it('темп месяца и опережение', () => {
    const date = new Date(2026, 10, 11)
    const pace = monthPace(date)
    expect(pace).toBeCloseTo(11 / 30)
    const env = (used: number, extra: Partial<Envelope> = {}): Envelope => ({ id: 'e', name: 'e', kind: 'spend', limit: 1000000, used, paced: true, ...extra })
    expect(isAheadOfPace(env(400000), pace)).toBe(false) // 40% при темпе 37% — в пределах запаса
    expect(isAheadOfPace(env(620000), pace)).toBe(true)
    expect(isAheadOfPace(env(960000, { paced: false }), pace)).toBe(false)
    expect(isAheadOfPace(env(960000, { kind: 'save' }), pace)).toBe(false)
  })

  it('остаток на день и честный баланс', () => {
    expect(dailyAllowance(840000, new Date(2026, 10, 11))).toBe(42000) // 20 дней, включая сегодня
    expect(dailyAllowance(-5, new Date(2026, 10, 11))).toBe(0)
    expect(honestBalance([{ id: 'a', balance: 6000000 }, { id: 'b', balance: 2092000 }], [{ id: 'p', remainder: 3250000 }])).toBe(4842000)
  })
})
