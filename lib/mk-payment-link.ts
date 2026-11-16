import { createHmac, timingSafeEqual } from 'crypto'

// Посилання на доплату за майстер-клас. Індивідуальний МК бере лише
// передоплату 700 грн, решту досі платили в студії — це посилання дає
// змогу закрити її заздалегідь або просто карткою на місці.
//
// Головна відмінність від `service-link.ts`: **суми тут немає**. У послуг
// її ніде взяти, крім посилання, а тут є рядок у «MK Orders», де лежить
// і вартість, і все сплачене. Тому підписуємо лише те, *чий* це запис,
// а скільки лишилось — рахуємо щоразу наново.
//
// Так воно й має бути: людина могла доплатити готівкою в студії вже після
// того, як лист пішов. Якби сума жила в посиланні, вона заплатила б двічі.

export interface MkPaymentPayload {
  studio: string
  /** Повне ім'я, як воно записане в «MK Orders» */
  client: string
  /** Ключ майстер-класу, YYYY-MM-DD HH:MM */
  mkKey: string
  /** Коли виписали, мс */
  issued: number
}

function secret(): string {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET не налаштований')
  return value
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest().toString('base64url')
}

export function encodeMkPaymentLink(data: MkPaymentPayload): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function decodeMkPaymentLink(token: string): MkPaymentPayload | null {
  const [payload, signature] = String(token ?? '').split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length) return null
  if (!timingSafeEqual(expected, given)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as MkPaymentPayload
    if (!data.studio || !data.client || !data.mkKey) return null
    return data
  } catch {
    return null
  }
}

export interface MkDebt {
  client: string
  mkDatetime: string
  people: number
  amount: number
  paid: number
  /** Скільки лишилось. 0 — уже все сплачено */
  due: number
  rowIndex: number
}

/**
 * Скільки насправді лишилось доплатити просто зараз.
 * Повертає null, якщо запису вже немає — скасували або видалили.
 */
export async function readMkDebt(link: MkPaymentPayload): Promise<MkDebt | null> {
  const { getOrders } = await import('./orders')
  const orders = await getOrders(link.studio)

  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
  const order = orders.find((item) =>
    item.mkKey === link.mkKey
    && normalize(item.client) === normalize(link.client)
    && item.status.trim().toLowerCase() !== 'cancelled')

  if (!order) return null

  return {
    client: order.client,
    mkDatetime: order.mkDatetime,
    people: order.people,
    amount: order.amount,
    paid: order.paid,
    due: order.debt,
    rowIndex: order.rowIndex,
  }
}
