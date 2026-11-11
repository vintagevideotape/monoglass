import { createRemoteJWKSet, jwtVerify } from 'jose'
import { HttpError } from './env'
import type { Env } from './env'

let keys: { domain: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null

function isLocal(request: Request): boolean {
  const host = new URL(request.url).hostname
  return host === 'localhost' || host === '127.0.0.1'
}

/**
 * Кто пришёл. Вход закрыт по умолчанию: без настроенного Cloudflare Access API не отвечает никому.
 * Подпись Access проверяется здесь же, а не только на входе в сеть Cloudflare.
 */
export async function emailOf(request: Request, env: Env): Promise<string> {
  if (env.TEAM_DOMAIN && env.POLICY_AUD) {
    const token = request.headers.get('cf-access-jwt-assertion')
    if (!token) throw new HttpError(401, 'Нужен вход')
    const domain = env.TEAM_DOMAIN.replace(/\/$/, '')
    if (!keys || keys.domain !== domain) keys = { domain, set: createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`)) }
    try {
      const { payload } = await jwtVerify(token, keys.set, { issuer: domain, audience: env.POLICY_AUD })
      if (typeof payload.email !== 'string' || payload.email === '') throw new Error('no email')
      return payload.email.toLowerCase()
    } catch {
      throw new HttpError(401, 'Вход не подтверждён')
    }
  }
  if (env.DEV_EMAIL && isLocal(request)) return env.DEV_EMAIL.toLowerCase()
  throw new HttpError(503, 'Вход не настроен: задайте TEAM_DOMAIN и POLICY_AUD')
}

/**
 * Профиль по почте. Первый вошедший становится владельцем; остальные почты не пускаются,
 * пока владелец не добавит для них профиль.
 */
export async function ownerOf(request: Request, env: Env): Promise<{ id: string; email: string }> {
  const email = await emailOf(request, env)
  const found = await env.DB.prepare('SELECT id FROM profiles WHERE email = ?').bind(email).first<{ id: string }>()
  if (found) return { id: found.id, email }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first<{ n: number }>()
  if ((count?.n ?? 0) > 0) throw new HttpError(403, 'Для этой почты нет профиля')
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO profiles (id, email, created_at) VALUES (?, ?, ?)').bind(id, email, Date.now()).run()
  return { id, email }
}
