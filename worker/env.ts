export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  /** Личный токен Monobank: только чтение выписки. */
  MONO_TOKEN?: string
  /** Cloudflare Access: https://<команда>.cloudflareaccess.com и AUD приложения. */
  TEAM_DOMAIN?: string
  POLICY_AUD?: string
  BACKFILL_DAYS?: string
  /** Только для локального запуска: вход без Access. На настоящем адресе не действует. */
  DEV_EMAIL?: string
  /** Только для локального запуска: адрес подставного Monobank. */
  MONO_BASE?: string
  MONO_GAP?: string
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** D1 принимает не больше 100 параметров на запрос. */
export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function getState(db: D1Database, owner: string, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM state WHERE owner = ? AND key = ?').bind(owner, key).first<{ value: string }>()
  return row?.value ?? null
}

export function setState(db: D1Database, owner: string, key: string, value: string): D1PreparedStatement {
  return db.prepare('INSERT INTO state (owner, key, value) VALUES (?, ?, ?) ON CONFLICT (owner, key) DO UPDATE SET value = excluded.value').bind(owner, key, value)
}
