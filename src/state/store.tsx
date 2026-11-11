import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError, loadState } from '../api/client'
import type { Jar, LegacyReport, ServerState, SyncStatus } from '../api/client'
import { DEFAULT_INCOME, DEFAULT_PLANS, demoOperations } from '../data/demo'
import { importSheet } from '../domain/importSheet'
import { legacyRows } from '../domain/legacyRows'
import { toOperations } from '../domain/raw'
import type { AccountRow, OpRow } from '../domain/raw'
import type { Recurring } from '../domain/recurring'
import { DEFAULT_RULES } from '../domain/rules'
import type { CounterpartyRule, EnvelopePlan, Kopecks, Operation } from '../domain/types'

// Без сервера (прототип, локальный просмотр) всё хранится только в браузере этого устройства.
const KEYS = { csv: 'monoglass.csv', plans: 'monoglass.plans', income: 'monoglass.income' }
const POLL_MS = 60_000
const IMPORT_CHUNK = 250

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

export type Cloud = {
  email: string
  rows: OpRow[]
  accounts: AccountRow[]
  jars: Jar[]
  recurring: Recurring[]
  sync: SyncStatus
  fx: ServerState['fx']
  /** Последняя ошибка обращения к серверу. */
  error: string | null
  refresh: () => Promise<void>
  syncNow: () => Promise<string>
  connectMono: (token: string) => Promise<void>
  disconnectMono: () => Promise<void>
  importLegacy: (text: string, onProgress: (done: number, total: number) => void) => Promise<LegacyReport>
  legacyReport: () => Promise<LegacyReport>
  addOp: (op: { account_id: string; amount: Kopecks; description: string; kind?: string; category?: string; recurring_id?: string; period?: string; at?: number }) => Promise<void>
  removeOp: (id: string) => Promise<void>
  saveRecurring: (item: Recurring) => Promise<void>
  removeRecurring: (id: string) => Promise<void>
  patchAccount: (id: string, patch: { name?: string; sync?: boolean; opening_balance?: Kopecks; archived?: boolean }) => Promise<void>
  addCashAccount: (name: string, currency: number) => Promise<void>
}

type Store = {
  now: Date
  /** demo — выдуманные данные, mine — выгрузка в браузере, cloud — своя база. */
  source: 'demo' | 'mine' | 'cloud'
  loading: boolean
  operations: Operation[]
  plans: EnvelopePlan[]
  income: Kopecks
  cloud: Cloud | null
  /** Возвращает текст ошибки или null. */
  importCsv: (text: string) => string | null
  clearData: () => void
  setPlans: (plans: EnvelopePlan[]) => void
  setIncome: (income: Kopecks) => void
}

const Context = createContext<Store | null>(null)

function mergeRows(current: OpRow[], incoming: OpRow[]): OpRow[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((row) => [row.id, row]))
  for (const row of incoming) byId.set(row.id, row)
  return [...byId.values()].filter((row) => !row.deleted).sort((a, b) => b.at - a.at)
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const now = useMemo(() => new Date(), [])
  const [mine, setMine] = useState<Operation[] | null>(() =>
    read<Operation[] | null>(KEYS.csv, null, (raw) => {
      const ops = importSheet(raw)
      return ops.length > 0 ? ops : null
    }),
  )
  const [localPlans, setLocalPlans] = useState<EnvelopePlan[]>(() => read(KEYS.plans, DEFAULT_PLANS, (raw) => JSON.parse(raw) as EnvelopePlan[]))
  const [localIncome, setLocalIncome] = useState<Kopecks>(() => read(KEYS.income, DEFAULT_INCOME, Number))
  const demo = useMemo(() => demoOperations(now), [now])

  const [server, setServer] = useState<ServerState | null>(null)
  const [rows, setRows] = useState<OpRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const since = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const next = await loadState(since.current)
      if (next === null) return
      since.current = next.serverTime
      setRows((current) => (next.full ? next.ops : mergeRows(current, next.ops)))
      setServer(next)
      setError(null)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Нет связи с сервером')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const cloudOperations = useMemo(() => {
    if (!server) return []
    const names = new Map(server.accounts.map((account) => [account.id, account.name]))
    return toOperations(rows, names, DEFAULT_RULES, (server.settings.counterparties as CounterpartyRule[] | undefined) ?? [])
  }, [rows, server])

  const cloud: Cloud | null = server
    ? {
        email: server.profile.email,
        rows,
        accounts: server.accounts,
        jars: server.jars,
        recurring: server.recurring,
        sync: server.sync,
        fx: server.fx,
        error,
        refresh,
        syncNow: async () => {
          const result = await api<{ detail: string }>('POST', '/sync/now')
          await refresh()
          return result.detail
        },
        connectMono: async (token) => {
          await api('PUT', '/mono/token', { token })
          await refresh()
        },
        disconnectMono: async () => {
          await api('DELETE', '/mono/token')
          await refresh()
        },
        importLegacy: async (text, onProgress) => {
          const parsed = legacyRows(text)
          if (parsed.length === 0) throw new ApiError('В файле нет операций')
          for (let done = 0; done < parsed.length; done += IMPORT_CHUNK) {
            await api('POST', '/legacy/import', { rows: parsed.slice(done, done + IMPORT_CHUNK) })
            onProgress(Math.min(parsed.length, done + IMPORT_CHUNK), parsed.length)
          }
          since.current = 0
          await refresh()
          return api<LegacyReport>('GET', '/legacy/report')
        },
        legacyReport: () => api<LegacyReport>('GET', '/legacy/report'),
        addOp: async (op) => {
          await api('POST', '/ops', op)
          await refresh()
        },
        removeOp: async (id) => {
          await api('DELETE', `/ops/${encodeURIComponent(id)}`)
          await refresh()
        },
        saveRecurring: async (item) => {
          await api('PUT', `/recurring/${encodeURIComponent(item.id)}`, item)
          await refresh()
        },
        removeRecurring: async (id) => {
          await api('DELETE', `/recurring/${encodeURIComponent(id)}`)
          await refresh()
        },
        patchAccount: async (id, patch) => {
          await api('PATCH', `/accounts/${encodeURIComponent(id)}`, patch)
          await refresh()
        },
        addCashAccount: async (name, currency) => {
          await api('POST', '/accounts', { name, currency })
          await refresh()
        },
      }
    : null

  const plans = server ? ((server.settings.plans as EnvelopePlan[] | undefined) ?? DEFAULT_PLANS) : localPlans
  const income = server ? ((server.settings.income as Kopecks | undefined) ?? DEFAULT_INCOME) : localIncome
  const saveSetting = (key: string, value: unknown) => {
    setServer((current) => (current ? { ...current, settings: { ...current.settings, [key]: value } } : current))
    api('PUT', `/settings/${key}`, { value }).catch((failure: unknown) => setError(failure instanceof ApiError ? failure.message : 'Настройка не сохранилась'))
  }

  const store: Store = {
    now,
    source: server ? 'cloud' : mine ? 'mine' : 'demo',
    loading,
    operations: server ? cloudOperations : (mine ?? demo),
    plans,
    income,
    cloud,
    importCsv: (text) => {
      try {
        const ops = importSheet(text)
        if (ops.length === 0) return 'В файле нет операций'
        setMine(ops)
        write(KEYS.csv, text)
        return null
      } catch (failure) {
        return failure instanceof Error ? failure.message : 'Файл не читается'
      }
    },
    clearData: () => {
      setMine(null)
      write(KEYS.csv, null)
    },
    setPlans: (next) => {
      if (server) return saveSetting('plans', next)
      setLocalPlans(next)
      write(KEYS.plans, JSON.stringify(next))
    },
    setIncome: (next) => {
      if (server) return saveSetting('income', next)
      setLocalIncome(next)
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
