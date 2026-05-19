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
} from '@/lib/wayforpay'
import { getStudio, getSpreadsheetId } from '@/lib/studios'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const slotId        = raw?.slotId as string | undefined
  const studioId      = (raw?.studio as string ?? 'sumy')
  const certificateCode = ((raw?.certificateCode as string ?? '')).trim() || undefined
  const parsed = formSchema.safeParse(body)

  if (!parsed.success || !slotId) {
    return NextResponse.json(
      { error: 'Помилка валідації', fields: parsed.success ? {} : parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const studio = getStudio(studioId)
  if (!studio) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }

  const spreadsheetId = getSpreadsheetId(studioId)
  const { name, surname, phone, instagram, peopleCount } = parsed.data

  const slot = await getSlotById(slotId, spreadsheetId).catch(() => null)
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
      certResult = await validateCertificate(certificateCode, spreadsheetId)
    } catch (err) {
      console.error('[POST /api/register] ❌ validateCertificate:', err)
      return NextResponse.json({ error: 'Помилка перевірки сертифікату. Спробуйте ще раз.' }, { status: 500 })
    }

    if (!certResult.valid) {
      return NextResponse.json({ error: certResult.reason }, { status: 400 })
    }

    const extraCount = peopleCount - certResult.info.peopleCount

    // ── Тільки сертифікат — записуємо одразу ─────────────────────────────
    if (extraCount <= 0) {
      try {
        const clientFullName = await findOrCreateClient(name, surname, phone, instagram, spreadsheetId)
        await appendOrder({
          clientFullName,
          mkDatetime: slot.datetime,
          peopleCount,
          orderReference: certificateCode,
          status: 'certificate',
          pricePerPerson: studio.pricePerPerson,
        }, spreadsheetId)
        await redeemCertificate(certResult.info.rowIndex, spreadsheetId)
      } catch (err) {
        console.error('[POST /api/register] ❌ certificate save:', err)
        return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // ── Сертифікат + доплата — оплата спочатку ───────────────────────────
    const orderReference = encodeOrderData({
      n: name, s: surname, p: phone, i: instagram ?? '',
      c: peopleCount, d: slot.datetime,
      st: 'cert+payment',
      studio: studioId,
      cert: certificateCode,
      cri: certResult.info.rowIndex,
    })

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!
      const description = `Передоплата (сертифікат + ${extraCount} дод. учасн.) · МК ${slot.date} о ${slot.time}`
      const { invoiceUrl } = await createInvoice({
        orderReference,
        description,
        amount: studio.pricePerPerson,
        returnUrl: `${baseUrl}/api/payment/return?studio=${studioId}`,
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
  const orderReference = encodeOrderData({
    n: name, s: surname, p: phone, i: instagram ?? '',
    c: peopleCount, d: slot.datetime,
    st: 'booked',
    studio: studioId,
  })

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!
    const description = `Майстер-клас ${slot.date} о ${slot.time}`
    const { invoiceUrl } = await createInvoice({
      orderReference,
      description,
      amount: studio.pricePerPerson,
      returnUrl: `${baseUrl}/api/payment/return?studio=${studioId}`,
    })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (err) {
    console.error('[POST /api/register] ❌ WayForPay invoice:', err)
    return NextResponse.json(
      { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз або зверніться до нас.' },
      { status: 500 }
    )
  }
}
