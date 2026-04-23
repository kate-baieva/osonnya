import crypto from 'crypto'

const WAYFORPAY_API = 'https://api.wayforpay.com/api'
const PREPAYMENT_AMOUNT = 650

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
  description: string        // наприклад "Майстер-клас 25.04.2026 12:00"
}): Promise<InvoiceResult> {
  const merchantAccount   = process.env.WAYFORPAY_MERCHANT_ACCOUNT!
  const merchantDomain    = process.env.WAYFORPAY_MERCHANT_DOMAIN!
  const baseUrl           = process.env.NEXT_PUBLIC_BASE_URL!
  const { orderReference, description } = params

  const orderDate   = Math.floor(Date.now() / 1000)
  const amount      = PREPAYMENT_AMOUNT
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
    returnUrl:          `${baseUrl}/success`,
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

// Відповідь яку WayForPay очікує після отримання вебхука
export function buildWebhookResponse(orderReference: string): object {
  const key    = process.env.WAYFORPAY_SECRET_KEY!
  const status = 'accept'
  const time   = Math.floor(Date.now() / 1000)
  const signature = hmacMd5(`${orderReference};${status};${time}`, key)
  return { orderReference, status, time, signature }
}
