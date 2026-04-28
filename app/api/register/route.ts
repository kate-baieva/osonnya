import { NextRequest, NextResponse } from 'next/server'
import { formSchema } from '@/lib/validation'
import {
  getSlotById,
  findOrCreateClient,
  appendOrder,
  validateCertificate,
  redeemCertificate,
} from '@/lib/google-sheets'
import { createInvoice } from '@/lib/wayforpay'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const slotId = (body as Record<string, unknown>)?.slotId as string | undefined
  const certificateCode = ((body as Record<string, unknown>)?.certificateCode as string ?? '').trim() || undefined
  const parsed = formSchema.safeParse(body)

  if (!parsed.success || !slotId) {
    return NextResponse.json(
      { error: 'Помилка валідації', fields: parsed.success ? {} : parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { name, surname, phone, instagram, peopleCount } = parsed.data

  const slot = await getSlotById(slotId).catch(() => null)
  if (!slot) {
    return NextResponse.json({ error: 'Слот не знайдено або вже недоступний' }, { status: 404 })
  }
  if (slot.spotsRemaining < peopleCount) {
    return NextResponse.json(
      { error: `На цей майстер-клас залишилось лише ${slot.spotsRemaining} місць` },
      { status: 409 }
    )
  }

  // ─── Оплата сертифікатом ──────────────────────────────────────────────────
  if (certificateCode) {
    let certResult: Awaited<ReturnType<typeof validateCertificate>>
    try {
      certResult = await validateCertificate(certificateCode)
    } catch (err) {
      console.error('[POST /api/register] ❌ validateCertificate:', err)
      return NextResponse.json({ error: 'Помилка перевірки сертифікату. Спробуйте ще раз.' }, { status: 500 })
    }

    if (!certResult.valid) {
      return NextResponse.json({ error: certResult.reason }, { status: 400 })
    }
    if (certResult.info.peopleCount < peopleCount) {
      return NextResponse.json(
        { error: `Сертифікат розрахований на ${certResult.info.peopleCount} учасн.` },
        { status: 400 }
      )
    }

    try {
      const clientFullName = await findOrCreateClient(name, surname, phone, instagram)
      await appendOrder({
        clientFullName,
        mkDatetime: slot.datetime,
        peopleCount,
        orderReference: certificateCode,
        status: 'certificate',
      })
      await redeemCertificate(certResult.info.rowIndex)
    } catch (err) {
      console.error('[POST /api/register] ❌ certificate save:', err)
      return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // ─── Оплата карткою через WayForPay ──────────────────────────────────────
  const orderReference = `osonnya_${Date.now()}`

  try {
    const clientFullName = await findOrCreateClient(name, surname, phone, instagram)
    await appendOrder({
      clientFullName,
      mkDatetime: slot.datetime,
      peopleCount,
      orderReference,
    })
  } catch (err) {
    console.error('[POST /api/register] ❌ збереження в таблицю:', err)
    return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
  }

  try {
    const description = `Майстер-клас ${slot.date} о ${slot.time}`
    const { invoiceUrl } = await createInvoice({ orderReference, description })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (err) {
    console.error('[POST /api/register] ❌ WayForPay invoice:', err)
    return NextResponse.json(
      { error: 'Запис збережено, але не вдалось створити посилання на оплату. Зверніться до нас.' },
      { status: 500 }
    )
  }
}
