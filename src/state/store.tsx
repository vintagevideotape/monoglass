import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_INCOME, DEFAULT_PLANS, demoOperations } from '../data/demo'
import { importSheet } from '../domain/importSheet'
import type { EnvelopePlan, Kopecks, Operation } from '../domain/types'

// Всё хранится только в браузере этого устройства. На сервер ничего не уходит.
const KEYS = { csv: 'monoglass.csv', plans: 'monoglass.plans', income: 'monoglass.income' }

function read<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : parse(raw)
  } catch {
    return fallback
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Хранилище недоступно — данные живут до закрытия вкладки.
  }
}

type Store = {
  now: Date
  source: 'demo' | 'mine'
  operations: Operation[]
  plans: EnvelopePlan[]
  income: Kopecks
  /** Возвращает текст ошибки или null. */
  importCsv: (text: string) => string | null
  clearData: () => void
  setPlans: (plans: EnvelopePlan[]) => void
  setIncome: (income: Kopecks) => void
}

const Context = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const now = useMemo(() => new Date(), [])
  const [mine, setMine] = useState<Operation[] | null>(() =>
    read<Operation[] | null>(KEYS.csv, null, (raw) => {
      const ops = importSheet(raw)
      return ops.length > 0 ? ops : null
    }),
  )
  const [plans, setPlansState] = useState<EnvelopePlan[]>(() => read(KEYS.plans, DEFAULT_PLANS, (raw) => JSON.parse(raw) as EnvelopePlan[]))
  const [income, setIncomeState] = useState<Kopecks>(() => read(KEYS.income, DEFAULT_INCOME, Number))
  const demo = useMemo(() => demoOperations(now), [now])

  const store: Store = {
    now,
    source: mine ? 'mine' : 'demo',
    operations: mine ?? demo,
    plans,
    income,
    importCsv: (text) => {
      try {
        const ops = importSheet(text)
        if (ops.length === 0) return 'В файле нет операций'
        setMine(ops)
        write(KEYS.csv, text)
        return null
      } catch (error) {
        return error instanceof Error ? error.message : 'Файл не читается'
      }
    },
    clearData: () => {
      setMine(null)
      write(KEYS.csv, null)
    },
    setPlans: (next) => {
      setPlansState(next)
      write(KEYS.plans, JSON.stringify(next))
    },
    setIncome: (next) => {
      setIncomeState(next)
      write(KEYS.income, String(next))
    },
  }

  return <Context.Provider value={store}>{children}</Context.Provider>
}

export function useStore(): Store {
  const store = useContext(Context)
  if (!store) throw new Error('useStore вне StoreProvider')
  return store
}
