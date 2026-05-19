import crypto from 'crypto'

const WAYFORPAY_API = 'https://api.wayforpay.com/api'
export const PREPAYMENT_AMOUNT_PER_PERSON = 650

function hmacMd5(str: string, key: string): string {
  return crypto.createHmac('md5', key).update(str).digest('hex')
}

function generateSignature(fields: (string | number)[]): string {
  const key = process.env.WAYFORPAY_SECRET_KEY!
  return hmacMd5(fields.join(';'), key)
}

export interface InvoiceResult {
  invoiceUrl: string
  orderReference: string
}

export async function createInvoice(params: {
  orderReference: string
  description: string
  amount?: number
  returnUrl?: string  // студія-специфічний URL; якщо немає — /api/payment/return
}): Promise<InvoiceResult> {
  const merchantAccount   = process.env.WAYFORPAY_MERCHANT_ACCOUNT!
  const merchantDomain    = process.env.WAYFORPAY_MERCHANT_DOMAIN!
  const baseUrl           = process.env.NEXT_PUBLIC_BASE_URL!
  const { orderReference, description } = params
  const returnUrl = params.returnUrl ?? `${baseUrl}/api/payment/return`

  const orderDate   = Math.floor(Date.now() / 1000)
  const amount      = params.amount ?? PREPAYMENT_AMOUNT_PER_PERSON
  const currency    = 'UAH'
  const productName = description
  const productCount = 1
  const productPrice = amount

  const signature = generateSignature([
    merchantAccount,
    merchantDomain,
    orderReference,
    orderDate,
    amount,
    currency,
    productName,
    productCount,
    productPrice,
  ])

  const body = {
    transactionType:    'CREATE_INVOICE',
    merchantAccount,
    merchantAuthType:   'SimpleSignature',
    merchantDomainName: merchantDomain,
    merchantSignature:  signature,
    apiVersion:         1,
    language:           'UA',
    serviceUrl:         `${baseUrl}/api/webhook/wayforpay`,
    returnUrl,
    orderReference,
    orderDate,
    amount,
    currency,
    productName:  [productName],
    productPrice: [productPrice],
    productCount: [productCount],
  }

  const res = await fetch(WAYFORPAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = await res.json()
  console.log('[WayForPay] createInvoice response:', json)

  if (!json.invoiceUrl) {
    throw new Error(`WayForPay error: ${json.reason ?? JSON.stringify(json)}`)
  }

  return { invoiceUrl: json.invoiceUrl, orderReference }
}

// Перевіряємо підпис вебхука від WayForPay
export function verifyWebhookSignature(payload: Record<string, unknown>): boolean {
  const key = process.env.WAYFORPAY_SECRET_KEY!
  const fields = [
    payload.merchantAccount,
    payload.orderReference,
    payload.amount,
    payload.currency,
    payload.authCode,
    payload.cardPan,
    payload.transactionStatus,
    payload.reasonCode,
  ]
  const expected = hmacMd5(fields.join(';'), key)
  return expected === payload.merchantSignature
}

// ─── Кодування даних замовлення в orderReference ─────────────────────────────
// Дані клієнта і замовлення кодуємо в base64url прямо в рядку orderReference.
// Таблиця не чіпається до підтвердження оплати — все записується у вебхуку.

export interface PendingOrderData {
  n: string    // name
  s: string    // surname
  p: string    // phone
  i: string    // instagram ('' якщо немає)
  c: number    // peopleCount
  d: string    // mkDatetime
  st: string   // status: 'booked' | 'cert+payment'
  studio: string // studio id: 'sumy' | 'if'
  cert?: string  // certificateCode (тільки для cert+payment)
  cri?: number   // certRowIndex (тільки для cert+payment)
}

export function encodeOrderData(data: PendingOrderData): string {
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `osonnya_${encoded}`
}

export function decodeOrderData(orderReference: string): PendingOrderData | null {
  const prefix = 'osonnya_'
  if (!orderReference.startsWith(prefix)) return null
  const encoded = orderReference.slice(prefix.length)
  // Старий формат — просто timestamp: "1234567890"
  if (/^\d+$/.test(encoded)) return null
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString()) as PendingOrderData
  } catch {
    return null
  }
}

// Відповідь яку WayForPay очікує після отримання вебхука
export function buildWebhookResponse(orderReference: string): object {
  const key    = process.env.WAYFORPAY_SECRET_KEY!
  const status = 'accept'
  const time   = Math.floor(Date.now() / 1000)
  const signature = hmacMd5(`${orderReference};${status};${time}`, key)
  return { orderReference, status, time, signature }
}
