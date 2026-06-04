import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createInvoice, encodeOrderData } from '@/lib/wayforpay'
import { createCertificateRecord, findOrCreateClient } from '@/lib/google-sheets'
import { getStudio, getSpreadsheetId } from '@/lib/studios'

const bodySchema = z.object({
  studio:      z.string().min(1),
  mkLabel:     z.string().min(1),
  peopleCount: z.number().int().positive(),
  price:       z.number().positive(),
  name:        z.string().min(2).max(50),
  surname:     z.string().min(2).max(50),
  phone:       z.string().min(1).regex(/^\+?3?8?0?\d{9}$|^0\d{9}$/, 'Некоректний телефон'),
  instagram:   z.string().min(1).max(100),
  certType:    z.enum(['paper', 'digital']).default('paper'),
  skipPayment: z.boolean().optional(),
})

// Генерує унікальний код сертифіката: WEB-XXXXXX
function generateCertCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'WEB-'
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

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

  const { studio: studioId, mkLabel, peopleCount, price,
          name, surname, phone, instagram, certType, skipPayment } = parsed.data

  const studio = getStudio(studioId)
  if (!studio) return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })

  const spreadsheetId = getSpreadsheetId(studioId)
  const certCode = generateCertCode()
  const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL!

  // ── Тест-режим (тільки localhost) ──────────────────────────────────────────
  if (skipPayment && process.env.NODE_ENV === 'development') {
    try {
      const clientFullName = await findOrCreateClient(name, surname, phone, instagram, spreadsheetId)
      await createCertificateRecord({
        buyerName: clientFullName,
        buyerPhone: phone,
        buyerInstagram: instagram,
        peopleCount,
        mkType: mkLabel,
        price,
        certCode,
      }, spreadsheetId)
      console.log(`[buy-certificate] ✅ TEST сертифікат створено: ${certCode}`)
    } catch (err) {
      console.error('[buy-certificate] ❌ TEST save:', err)
      return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
    }
    return NextResponse.json({ success: true, certCode, certType, mkLabel, peopleCount })
  }

  const orderReference = encodeOrderData({
    n: name, s: surname, p: phone, i: instagram,
    c: peopleCount,
    d: new Date().toISOString(),
    st: 'booked',
    studio: studioId,
    tp: 'cert-purchase',
    amt: price,
    certCode,
    mkLabel,
  })

  try {
    const returnUrl = `${baseUrl}/api/payment/return?studio=${studioId}&certCode=${encodeURIComponent(certCode)}&certType=${certType}&mk=${encodeURIComponent(mkLabel)}&count=${peopleCount}`
    const description = `Сертифікат · ${mkLabel} · ${peopleCount} учасн.`
    const { invoiceUrl } = await createInvoice({
      orderReference,
      description,
      amount: price,
      returnUrl,
    })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (err) {
    console.error('[buy-certificate] ❌ WayForPay:', err)
    return NextResponse.json(
      { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз.' },
      { status: 500 }
    )
  }
}
