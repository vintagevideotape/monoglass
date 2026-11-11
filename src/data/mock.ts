// Условные данные для прототипа. На этапе «Доменное ядро» их заменят реальные модели и расчёты.

export type Account = {
  id: string
  label: string
  /** Сумма в гривне (для валютных счетов — пересчёт по курсу). */
  amount: number
  approx?: boolean
}

export type Envelope = {
  id: string
  name: string
  kind: 'spend' | 'save'
  limit: number
  /** Потрачено (spend) или отложено (save) с начала месяца. */
  used: number
  /** Сравнивать ли с темпом месяца. Для фиксированных платежей — нет. */
  paced: boolean
}

export type Operation = {
  id: string
  time: string
  title: string
  note: string
  amount: number
  /** Проектные операции и переводы не входят в личные расходы. */
  personal: boolean
}

export const today = new Date(2026, 10, 11)

export const accounts: Account[] = [
  { id: 'mono-black', label: 'Mono чёрная', amount: 21480 },
  { id: 'mono-white', label: 'Mono белая', amount: 6240 },
  { id: 'cash-uah', label: 'Наличные ₴', amount: 4100 },
  { id: 'cash-usd', label: 'Наличные $ 400', amount: 16600, approx: true },
]

export const envelopes: Envelope[] = [
  { id: 'needs', name: 'Нужды', kind: 'spend', limit: 14000, used: 5600, paced: true },
  { id: 'fixed', name: 'Фикс', kind: 'spend', limit: 12000, used: 11500, paced: false },
  { id: 'fun', name: 'Баловство', kind: 'spend', limit: 5000, used: 3100, paced: true },
  { id: 'cushion', name: 'Подушка', kind: 'save', limit: 6000, used: 4000, paced: false },
  { id: 'goals', name: 'Цели', kind: 'save', limit: 5000, used: 2500, paced: false },
]

export const operations: Operation[] = [
  { id: 'o3', time: '13:05', title: 'Aroma Kava', note: 'Баловство', amount: -75, personal: true },
  { id: 'o2', time: '11:40', title: 'Bolt', note: 'Проект «Съёмка 14.11»', amount: -132, personal: false },
  { id: 'o1', time: '09:12', title: 'Сільпо', note: 'Нужды', amount: -486, personal: true },
]

export const project = { name: 'Съёмка 14.11', balance: 32500 }

export const dailyLimit = 900
