import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, buildWebhookResponse } from '@/lib/wayforpay'
import { findOrderRowByReference, updateOrderPrepayment } from '@/lib/google-sheets'

const PREPAYMENT_AMOUNT = 650

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  console.log('[webhook/wayforpay] payload:', payload)

  // Перевіряємо підпис
  if (!verifyWebhookSignature(payload)) {
    console.error('[webhook/wayforpay] ❌ невірний підпис')
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const orderReference   = payload.orderReference as string
  const transactionStatus = payload.transactionStatus as string

  console.log(`[webhook/wayforpay] orderReference=${orderReference}, status=${transactionStatus}`)

  // Обробляємо тільки успішні оплати
  if (transactionStatus === 'Approved') {
    try {
      const rowIndex = await findOrderRowByReference(orderReference)
      if (rowIndex) {
        await updateOrderPrepayment(rowIndex, PREPAYMENT_AMOUNT)
        console.log(`[webhook/wayforpay] ✅ передоплату записано, рядок ${rowIndex}`)
      } else {
        console.warn(`[webhook/wayforpay] ⚠️ замовлення не знайдено: ${orderReference}`)
      }
    } catch (err) {
      console.error('[webhook/wayforpay] ❌ помилка оновлення таблиці:', err)
    }
  }

  // WayForPay вимагає підтвердження отримання вебхука
  return NextResponse.json(buildWebhookResponse(orderReference))
}
