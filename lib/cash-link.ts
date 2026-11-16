import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// Посилання на запис із оплатою готівкою. Кейт зрідка погоджується пустити
// людину без онлайн-оплати, коли на МК багато вільних місць. Доти такі
// домовленості жили в голові («попередь дівчат, прийдуть без запису») і
// губились. Посилання перетворює домовленість на звичайний рядок у таблиці.
//
// Суми в посиланні немає — її рахує сервер із ціни студії в мить запису,
// як і для звичайного запису карткою. Підписано лише те, *на який* МК
// і на скільки людей ця домовленість.
//
// **Посилання одноразове.** Інакше його перешлють подрузі, і замість однієї
// людини без оплати прийде компанія. Слідом за записом у «Comment» лягає
// `Готівка · <id>`; наступне відкриття того самого посилання знаходить цей
// рядок і більше нікого не пускає. Окремого аркуша для «використаних» не
// треба — сам запис і є відміткою, і його видно в таблиці.

export interface CashLinkPayload {
  studio: string
  /** Slot.id — EventId групового МК (або `row_N`, якщо id немає) */
  slot: string
  /** Скільки людей максимум можна записати за цим посиланням */
  max: number
  /** Короткий ідентифікатор посилання; він же в колонці «Comment» */
  id: string
  /** Коли виписали, мс */
  issued: number
}

/** Те, що лягає в «Comment» рядка MK Orders. За ним посилання й «згорає». */
export function cashComment(id: string): string {
  return `Готівка · ${id}`
}

function secret(): string {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET не налаштований')
  return value
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest().toString('base64url')
}

export function newCashLinkId(): string {
  return randomBytes(3).toString('hex').toUpperCase()
}

export function encodeCashLink(data: CashLinkPayload): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function decodeCashLink(token: string): CashLinkPayload | null {
  const [payload, signature] = String(token ?? '').split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length) return null
  if (!timingSafeEqual(expected, given)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as CashLinkPayload
    if (!data.studio || !data.slot || !data.id) return null
    if (typeof data.max !== 'number' || !(data.max > 0)) return null
    return data
  } catch {
    return null
  }
}

/**
 * Чи записався хтось за цим посиланням. Скасований запис теж рахується
 * використаним: місце звільнилось, але домовленість уже відпрацювала,
 * і тихо пустити за тим самим посиланням ще когось не можна.
 */
export async function isCashLinkUsed(payload: CashLinkPayload): Promise<boolean> {
  const { getOrders } = await import('./orders')
  const orders = await getOrders(payload.studio)
  const mark = cashComment(payload.id).toLowerCase()
  return orders.some((order) => order.comment.trim().toLowerCase() === mark)
}
