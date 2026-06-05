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
  createCertificateRecord,
} from '@/lib/google-sheets'
import { getSpreadsheetId } from '@/lib/studios'

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

  console.log(`[webhook/wayforpay] ref=${orderReference}, status=${transactionStatus}, amount=${paidAmount}`)

  if (transactionStatus === 'Approved') {
    try {
      const orderData = decodeOrderData(orderReference)

      if (orderData) {
        // ── Новий формат: дані закодовані в orderReference ──────────────
        const studioId      = orderData.studio ?? 'sumy'
        const spreadsheetId = getSpreadsheetId(studioId)
        const pricePerPerson = orderData.studio === 'if' ? 700 : 650

        console.log(`[webhook/wayforpay] студія=${studioId}, декодовано:`, orderData)

        const clientFullName = await findOrCreateClient(
          orderData.n, orderData.s, orderData.p, orderData.i || undefined,
          spreadsheetId,
        )

        // ── Покупка сертифіката ──────────────────────────────────────────
        // tp може бути 'cert-purchase' (старий формат) або 'cp' (скорочений)
        if (orderData.tp === 'cert-purchase' || (orderData.tp as string) === 'cp') {
          // certCode зберігається як 'cc' (нові замовлення) або 'certCode' (старий формат)
          const certCode = orderData.cc ?? (orderData as unknown as Record<string, string>).certCode
          if (!certCode) {
            console.error('[webhook/wayforpay] ❌ cert-purchase без certCode/cc')
          } else {
            // mkType реконструюємо з кількості учасників
            const mkType = orderData.c === 1 ? 'group'
              : orderData.c === 2 ? 'pair'
              : 'individual'
            await createCertificateRecord({
              buyerName: clientFullName,
              buyerPhone: orderData.p,
              buyerInstagram: orderData.i ?? '',
              peopleCount: orderData.c,
              mkType,
              price: orderData.amt ?? paidAmount,
              certCode,
            }, spreadsheetId)
            console.log(`[webhook/wayforpay] ✅ сертифікат створено: ${certCode}`)
          }
          return NextResponse.json(buildWebhookResponse(orderReference))
        }

        // ── Бронювання МК (груповий або індивідуальний) ──────────────────
        const isIndividual = orderData.tp === 'individual'

        const rowIndex = await appendOrder({
          clientFullName,
          mkDatetime: orderData.d,
          peopleCount: orderData.c,
          orderReference,
          status: orderData.st === 'cert+payment' ? 'certificate' : 'booked',
          ...(isIndividual
            ? { totalAmount: orderData.amt, mkType: 'individual' }
            : { pricePerPerson }),
        }, spreadsheetId)

        await updateOrderPrepayment(rowIndex, paidAmount, spreadsheetId)
        console.log(`[webhook/wayforpay] ✅ замовлення збережено: рядок ${rowIndex}, сума ${paidAmount}`)

        // Якщо cert+payment — погашаємо сертифікат
        if (orderData.cert && orderData.cri) {
          await redeemCertificate(orderData.cri, spreadsheetId)
          console.log(`[webhook/wayforpay] ✅ сертифікат погашено: ${orderData.cert}`)
        }
      } else {
        // ── Запасний варіант для старих замовлень ───────────────────────
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
