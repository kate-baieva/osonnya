import { NextRequest, NextResponse } from 'next/server'
import {
  verifyWebhookSignature,
  buildWebhookResponse,
  decodeOrderData,
} from '@/lib/wayforpay'
import {
  findOrCreateClient,
  appendOrder,
  updateOrderPrepayment,
  redeemCertificate,
  findOrderRowByReference,
} from '@/lib/google-sheets'

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  console.log('[webhook/wayforpay] payload:', payload)

  if (!verifyWebhookSignature(payload)) {
    console.error('[webhook/wayforpay] ❌ невірний підпис')
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const orderReference    = payload.orderReference as string
  const transactionStatus = payload.transactionStatus as string
  const paidAmount        = Number(payload.amount ?? 0)

  console.log(`[webhook/wayforpay] orderReference=${orderReference}, status=${transactionStatus}, amount=${paidAmount}`)

  if (transactionStatus === 'Approved') {
    try {
      const orderData = decodeOrderData(orderReference)

      if (orderData) {
        // ── Новий формат: всі дані закодовані в orderReference ──────────
        console.log('[webhook/wayforpay] декодовано дані замовлення:', orderData)

        const clientFullName = await findOrCreateClient(
          orderData.n, orderData.s, orderData.p, orderData.i || undefined
        )

        const rowIndex = await appendOrder({
          clientFullName,
          mkDatetime: orderData.d,
          peopleCount: orderData.c,
          orderReference,
          status: orderData.st === 'cert+payment' ? 'certificate' : 'booked',
        })

        await updateOrderPrepayment(rowIndex, paidAmount)
        console.log(`[webhook/wayforpay] ✅ замовлення збережено: рядок ${rowIndex}, сума ${paidAmount}`)

        // Якщо cert+payment — погашаємо сертифікат
        if (orderData.cert && orderData.cri) {
          await redeemCertificate(orderData.cri)
          console.log(`[webhook/wayforpay] ✅ сертифікат погашено: ${orderData.cert}`)
        }
      } else {
        // ── Запасний варіант для старих замовлень ───────────────────────
        console.log('[webhook/wayforpay] старий формат orderReference, шукаємо в таблиці')
        const found = await findOrderRowByReference(orderReference)
        if (found !== null) {
          await updateOrderPrepayment(found.rowIndex, paidAmount)
          console.log(`[webhook/wayforpay] ✅ (legacy) передоплату записано, рядок ${found.rowIndex}`)
        } else {
          console.warn(`[webhook/wayforpay] ⚠️ замовлення не знайдено: ${orderReference}`)
        }
      }
    } catch (err) {
      console.error('[webhook/wayforpay] ❌ помилка обробки:', err)
    }
  }

  return NextResponse.json(buildWebhookResponse(orderReference))
}
