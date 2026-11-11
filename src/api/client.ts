import type { AccountRow, OpRow } from '../domain/raw'
import type { Recurring } from '../domain/recurring'

export type Jar = { id: string; title: string; currency: number; balance: number; goal: number | null }

export type SyncStatus = {
  hasToken: boolean
  requestAt: number
  okAt: number
  accountsAt: number
  error: string
  errorAt: number
  jobs: { pending: number; done: number; failed: number }
}

export type ServerState = {
  profile: { email: string }
  serverTime: number
  full: boolean
  accounts: AccountRow[]
  jars: Jar[]
  recurring: Recurring[]
  settings: Record<string, unknown>
  ops: OpRow[]
  fx: { USD: number | null; EUR: number | null; date: string } | null
  sync: SyncStatus
}

export type LegacyReport = {
  legacyTotal: number
  unmatched: number
  matchedById: number
  matchedByFingerprint: number
  bank: number
  bankOnly: number
  manual: number
  bankFrom: number | null
  legacyFrom: number | null
  legacyTo: number | null
  legacyIn: number
  legacyOut: number
  unmatchedInsideBankPeriod: number
  possibleDuplicates: number
}

export class ApiError extends Error {}

/** Запрос к своему серверу. Ошибка с текстом сервера — ApiError. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
  if (!isJson) throw new ApiError(response.status === 200 ? 'Сервер не подключён' : `Сервер ответил ${response.status}`)
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new ApiError(data.error ?? `Сервер ответил ${response.status}`)
  return data
}

/**
 * Состояние с сервера. null — сервера нет вовсе (прототип, локальный просмотр): приложение остаётся в демо-режиме.
 * Отказ во входе и сбои сервера — ошибка, а не демо.
 */
export async function loadState(since = 0): Promise<ServerState | null> {
  let response: Response
  try {
    response = await fetch(`/api/state${since > 0 ? `?since=${since}` : ''}`)
  } catch {
    return null
  }
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
  if (!isJson) {
    if (response.ok || response.status === 404) return null
    throw new ApiError(`Сервер ответил ${response.status}`)
  }
  const data = (await response.json()) as ServerState & { error?: string }
  if (!response.ok) throw new ApiError(data.error ?? `Сервер ответил ${response.status}`)
  return data
}
