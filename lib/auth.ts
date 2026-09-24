// Сесія — підписаний HMAC токен у httpOnly cookie.
// Web Crypto, щоб перевірка працювала і в middleware (Edge), і в роутах (Node).

export type Role = 'admin' | 'master'

export interface Session {
  login: string
  name: string
  role: Role
  studio: string | null // 'sumy' | 'if'; null — доступ до обох (адміністратор)
  exp: number
}

export const SESSION_COOKIE = 'osonnya_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const encoder = new TextEncoder()

function b64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const payload = b64urlEncode(encoder.encode(JSON.stringify(session)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload))
  return `${payload}.${b64urlEncode(new Uint8Array(signature))}`
}

export async function verifySession(token: string, secret: string): Promise<Session | null> {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  let valid: boolean
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      b64urlDecode(signature),
      encoder.encode(payload),
    )
  } catch {
    return null
  }
  if (!valid) return null

  try {
    const session = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Session
    if (typeof session.exp !== 'number' || session.exp < Date.now()) return null
    return session
  } catch {
    return null
  }
}
