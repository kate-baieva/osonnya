import { NextRequest, NextResponse } from 'next/server'
import { formSchema } from '@/lib/validation'
import {
  getSlotById,
  findOrCreateClient,
  appendOrder,
  validateCertificate,
  redeemCertificate,
} from '@/lib/google-sheets'
import {
  createInvoice,
  encodeOrderData,
  PREPAYMENT_AMOUNT_PER_PERSON,
} from '@/lib/wayforpay'

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

  // ─── Оплата з сертифікатом ────────────────────────────────────────────────
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

    const extraCount = peopleCount - certResult.info.peopleCount

    // ── Тільки сертифікат (без доплати) — записуємо одразу ───────────────
    if (extraCount <= 0) {
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

    // ── Сертифікат + доплата — спочатку оплата, потім запис ──────────────
    // Кодуємо всі дані в orderReference, таблиця не чіпається до оплати
    const orderReference = encodeOrderData({
      n: name, s: surname, p: phone, i: instagram ?? '',
      c: peopleCount, d: slot.datetime,
      st: 'cert+payment',
      cert: certificateCode,
      cri: certResult.info.rowIndex,
    })

    try {
      const description = `Передоплата (сертифікат + ${extraCount} дод. учасн.) · МК ${slot.date} о ${slot.time}`
      const { invoiceUrl } = await createInvoice({
        orderReference,
        description,
        amount: PREPAYMENT_AMOUNT_PER_PERSON,
      })
      return NextResponse.json({ paymentUrl: invoiceUrl })
    } catch (err) {
      console.error('[POST /api/register] ❌ WayForPay cert+payment invoice:', err)
      return NextResponse.json(
        { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз або зверніться до нас.' },
        { status: 500 }
      )
    }
  }

  // ─── Оплата карткою — спочатку оплата, потім запис ───────────────────────
  // Кодуємо всі дані в orderReference, таблиця не чіпається до оплати
  const orderReference = encodeOrderData({
    n: name, s: surname, p: phone, i: instagram ?? '',
    c: peopleCount, d: slot.datetime,
    st: 'booked',
  })

  try {
    const description = `Майстер-клас ${slot.date} о ${slot.time}`
    const { invoiceUrl } = await createInvoice({ orderReference, description })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (err) {
    console.error('[POST /api/register] ❌ WayForPay invoice:', err)
    return NextResponse.json(
      { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз або зверніться до нас.' },
      { status: 500 }
    )
  }
}
