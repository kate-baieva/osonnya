import { createHmac, timingSafeEqual } from 'crypto'
import type { Category } from './service-categories'

// Посилання на оплату послуги несе в собі суму — і більше ніде її взяти:
// на відміну від майстер-класів, у послуг немає аркуша з цінами, щоб
// перерахувати все на сервері. Тому посилання підписане: підміниш суму
// в адресному рядку — підпис не зійдеться й оплата не почнеться.

export interface ServicePayload {
  studio: string
  category: Category
  comment: string
  amount: number
  issued: number // коли виписали, мс
}

function secret(): string {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET не налаштований')
  return value
}

function b64url(value: Buffer): string {
  return value.toString('base64url')
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest())
}

export function encodeServiceLink(data: ServicePayload): string {
  const payload = b64url(Buffer.from(JSON.stringify(data)))
  return `${payload}.${sign(payload)}`
}

export function decodeServiceLink(token: string): ServicePayload | null {
  const [payload, signature] = String(token ?? '').split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length) return null
  if (!timingSafeEqual(expected, given)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ServicePayload
    if (!data.studio || !data.category) return null
    if (typeof data.amount !== 'number' || !(data.amount > 0)) return null
    return data
  } catch {
    return null
  }
}
