import { HttpError } from './env'
import type { Env } from './env'

const encoder = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Ключ шифрования выводится из секрета воркера. Секрет не лежит ни в коде, ни в базе. */
async function key(env: Env): Promise<CryptoKey> {
  if (!env.TOKEN_KEY || env.TOKEN_KEY.length < 24) throw new HttpError(503, 'Не задан секрет TOKEN_KEY: токен негде безопасно хранить')
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(env.TOKEN_KEY))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Шифрует токен для хранения в базе. Привязка к профилю: шифротекст одного профиля не подойдёт другому. */
export async function seal(env: Env, owner: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(owner) }, await key(env), encoder.encode(secret))
  const out = new Uint8Array(12 + sealed.byteLength)
  out.set(iv)
  out.set(new Uint8Array(sealed), 12)
  return toBase64(out)
}

/** null — расшифровать нельзя (сменился ключ или запись повреждена): токен нужно ввести заново. */
export async function open(env: Env, owner: string, stored: string): Promise<string | null> {
  try {
    const bytes = fromBase64(stored)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(owner) }, await key(env), bytes.slice(12))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
