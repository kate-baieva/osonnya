import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, buildWebhookResponse } from '@/lib/wayforpay'
import { findOrderRowByReference, updateOrderPrepayment, validateCertificate, redeemCertificate } from '@/lib/google-sheets'

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

  const orderReference    = payload.orderReference as string
  const transactionStatus = payload.transactionStatus as string
  const paidAmount        = Number(payload.amount ?? 0)

  console.log(`[webhook/wayforpay] orderReference=${orderReference}, status=${transactionStatus}, amount=${paidAmount}`)

  // Обробляємо тільки успішні оплати
  if (transactionStatus === 'Approved') {
    try {
      const found = await findOrderRowByReference(orderReference)
      if (found) {
        const { rowIndex, certificateCode } = found

        // Записуємо передоплату (фактичну суму з WayForPay)
        await updateOrderPrepayment(rowIndex, paidAmount)
        console.log(`[webhook/wayforpay] ✅ передоплату записано, рядок ${rowIndex}, сума ${paidAmount}`)

        // Якщо замовлення має сертифікат (cert+payment) — погашаємо його
        if (certificateCode) {
          try {
            const certResult = await validateCertificate(certificateCode)
            if (certResult.valid) {
              await redeemCertificate(certResult.info.rowIndex)
              console.log(`[webhook/wayforpay] ✅ сертифікат погашено: ${certificateCode}`)
            } else {
              console.warn(`[webhook/wayforpay] ⚠️ сертифікат вже використано або недійсний: ${certificateCode}`)
            }
          } catch (err) {
            console.error('[webhook/wayforpay] ❌ помилка погашення сертифікату:', err)
          }
        }
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
