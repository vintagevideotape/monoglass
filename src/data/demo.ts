// Выдуманные данные для демо-режима. Личных данных здесь нет и быть не должно.
import type { AccountBalance, EnvelopePlan, Operation, OperationKind } from '../domain/types'

type Template = [daysAgo: number, time: string, title: string, category: string, hryvnia: number, kind?: OperationKind]

const TEMPLATES: Template[] = [
  [0, '13:05', 'Aroma Kava', 'Кафе и рестораны', -75],
  [0, '11:40', 'Bolt', 'Транспорт', -132, 'project'],
  [0, '09:12', 'Сільпо', 'Продукты', -486],
  [1, '21:30', 'Glovo', 'Кафе и рестораны', -420],
  [1, '18:02', 'АТБ', 'Продукты', -344],
  [1, '14:47', 'Нова пошта', 'Покупки и разное', -120],
  [1, '10:15', 'З Білої картки', 'Покупки и разное', 2000, 'transfer'],
  [2, '16:20', 'Аванс на съёмку', 'Проектные расходы', 40000, 'project'],
  [2, '08:00', 'Київстар', 'Подписки и сервисы', -250],
  [3, '19:10', 'Сільпо', 'Продукты', -912],
  [3, '12:30', 'Реквизит', 'Проектные расходы', -7368, 'project'],
  [4, '20:45', 'Кинотеатр', 'Игры и развлечения', -380],
  [4, '13:00', 'Аптека', 'Здоровье', -265],
  [5, '09:00', 'Аренда квартиры', 'Подписки и сервисы', -9800],
  [5, '18:40', 'АТБ', 'Продукты', -702],
  [6, '22:10', 'Бар', 'Алкоголь и напитки', -640],
  [6, '15:20', 'Зоомагазин', 'Питомцы', -410],
  [7, '11:00', 'Сільпо', 'Продукты', -1180],
  [7, '19:30', 'Ресторан', 'Кафе и рестораны', -980],
  [8, '10:00', 'Интернет', 'Подписки и сервисы', -300],
  [8, '17:15', 'Метро', 'Транспорт', -16],
  [9, '14:00', 'Steam', 'Игры и развлечения', -605],
  [9, '09:30', 'Фора', 'Продукты', -560],
  [10, '12:00', 'Рассрочка', 'Покупки и техника', -1150],
  [10, '18:00', 'АТБ', 'Продукты', -1420],
]

export function demoOperations(now: Date): Operation[] {
  return TEMPLATES.filter(([daysAgo]) => daysAgo < now.getDate()).map(([daysAgo, time, title, category, hryvnia, kind], index) => {
    const [hh, mm] = time.split(':').map(Number)
    return {
      id: `demo-${index}`,
      at: new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hh, mm),
      description: title,
      mcc: '',
      amount: hryvnia * 100,
      account: 'Демо',
      category,
      subcategory: '',
      kind: kind ?? 'expense',
    }
  })
}

export const demoAccounts: (AccountBalance & { label: string; approx?: boolean })[] = [
  { id: 'mono-black', label: 'Mono чёрная', balance: 5398000 },
  { id: 'mono-white', label: 'Mono белая', balance: 624000 },
  { id: 'cash-uah', label: 'Наличные ₴', balance: 410000 },
  { id: 'cash-usd', label: 'Наличные $ 400', balance: 1660000, approx: true },
]

export const demoProject = { id: 'shoot', name: 'Съёмка 14.11', remainder: 3250000 }

export const DEFAULT_INCOME = 4200000

/** Стартовая раскладка. Всё здесь меняется на экране «Бюджет». */
export const DEFAULT_PLANS: EnvelopePlan[] = [
  { id: 'fixed', name: 'Фикс', kind: 'spend', allocation: { type: 'fixed', amount: 1200000 }, categories: ['Подписки и сервисы', 'Покупки и техника'], paced: false },
  { id: 'needs', name: 'Нужды', kind: 'spend', allocation: { type: 'percent', percent: 45 }, categories: ['Продукты', 'Здоровье', 'Транспорт', 'Питомцы'], paced: true },
  { id: 'fun', name: 'Баловство', kind: 'spend', allocation: { type: 'percent', percent: 20 }, categories: ['Кафе и рестораны', 'Алкоголь и напитки', 'Игры и развлечения'], paced: true },
  { id: 'cushion', name: 'Подушка', kind: 'save', allocation: { type: 'percent', percent: 20 }, categories: [], paced: false },
  { id: 'goals', name: 'Цели', kind: 'save', allocation: { type: 'percent', percent: 15 }, categories: [], paced: false },
]
