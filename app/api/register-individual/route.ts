import { NextRequest, NextResponse } from 'next/server'
import { formSchema } from '@/lib/validation'
import {
  findOrCreateClient,
  appendOrder,
  validateCertificate,
  redeemCertificate,
} from '@/lib/google-sheets'
import { createInvoice, encodeOrderData } from '@/lib/wayforpay'
import { getStudio, getSpreadsheetId } from '@/lib/studios'
import { z } from 'zod'

// Передоплата для індивідуального МК — фіксована
const INDIVIDUAL_PREPAYMENT = 700

const bodySchema = formSchema.extend({
  studio:          z.string().min(1),
  date:            z.string().min(1),   // YYYY-MM-DD
  time:            z.string().min(1),   // HH:MM
  totalPrice:      z.number().positive(),
  certificateCode: z.string().optional(),
  skipPayment:     z.boolean().optional(), // тільки для dev-тестування
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Помилка валідації', fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { name, surname, phone, instagram, peopleCount,
          studio: studioId, date, time, totalPrice, certificateCode,
          skipPayment } = parsed.data

  const studio = getStudio(studioId)
  if (!studio) return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })

  const spreadsheetId = getSpreadsheetId(studioId)
  const mkDatetime     = `${date} ${time}`

  // ─── Оплата сертифікатом ───────────────────────────────────────────────────
  if (certificateCode) {
    let certResult: Awaited<ReturnType<typeof validateCertificate>>
    try {
      // Перевіряємо тип 'individual' у полі MK Type
      certResult = await validateCertificate(certificateCode.trim(), spreadsheetId, 'individual')
    } catch (err) {
      console.error('[register-individual] ❌ validateCertificate:', err)
      return NextResponse.json({ error: 'Помилка перевірки сертифікату. Спробуйте ще раз.' }, { status: 500 })
    }

    if (!certResult.valid) {
      return NextResponse.json({ error: certResult.reason }, { status: 400 })
    }

    if (certResult.info.peopleCount < peopleCount) {
      return NextResponse.json(
        { error: `Сертифікат розрахований на ${certResult.info.peopleCount} учасн., а ви вказали ${peopleCount}` },
        { status: 400 }
      )
    }

    // Сертифікат покриває все — записуємо одразу
    try {
      const clientFullName = await findOrCreateClient(name, surname, phone, instagram, spreadsheetId)
      await appendOrder({
        clientFullName,
        mkDatetime,
        peopleCount,
        orderReference: certificateCode.trim(),
        status: 'certificate',
        totalAmount: totalPrice,
        mkType: 'individual',
      }, spreadsheetId)
      await redeemCertificate(certResult.info.rowIndex, spreadsheetId)
    } catch (err) {
      console.error('[register-individual] ❌ certificate save:', err)
      return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // ─── Тест-режим (тільки localhost / NODE_ENV=development) ────────────────
  if (skipPayment && process.env.NODE_ENV === 'development') {
    try {
      const clientFullName = await findOrCreateClient(name, surname, phone, instagram, spreadsheetId)
      const rowIndex = await appendOrder({
        clientFullName,
        mkDatetime,
        peopleCount,
        orderReference: `test_${Date.now()}`,
        status: 'booked',
        totalAmount: totalPrice,
        mkType: 'individual',
      }, spreadsheetId)
      console.log(`[register-individual] ✅ TEST записано рядок ${rowIndex}`)
    } catch (err) {
      console.error('[register-individual] ❌ TEST save:', err)
      return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  // ─── Оплата карткою — 700 грн передоплата ─────────────────────────────────
  const orderReference = encodeOrderData({
    n: name, s: surname, p: phone, i: instagram ?? '',
    c: peopleCount,
    d: mkDatetime,
    st: 'booked',
    studio: studioId,
    tp: 'individual',
    amt: totalPrice,
  })

  try {
    const baseUrl   = process.env.NEXT_PUBLIC_BASE_URL!
    const description = `Індивідуальний МК · ${date} о ${time} · ${peopleCount} учасн.`
    const { invoiceUrl } = await createInvoice({
      orderReference,
      description,
      amount: INDIVIDUAL_PREPAYMENT,
      returnUrl: `${baseUrl}/api/payment/return?studio=${studioId}`,
    })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (err) {
    console.error('[register-individual] ❌ WayForPay:', err)
    return NextResponse.json(
      { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз.' },
      { status: 500 }
    )
  }
}
