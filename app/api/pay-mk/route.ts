import { NextResponse } from 'next/server'
import { decodeMkPaymentLink, readMkDebt } from '@/lib/mk-payment-link'
import { createInvoice, encodePendingRef } from '@/lib/wayforpay'
import { savePendingOrder } from '@/lib/google-sheets'
import { getSpreadsheetId, getStudio } from '@/lib/studios'

// Оплата залишку за майстер-клас із листа-нагадування.
//
// Суму клієнт не надсилає й надіслати не може: вона рахується тут,
// із рядка в «MK Orders». Посилання лише каже, чий це запис.

export async function POST(request: Request) {
  let body: { d?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const link = decodeMkPaymentLink(body.d ?? '')
  if (!link) {
    return NextResponse.json(
      { error: 'Посилання недійсне або змінене. Напишіть нам, ми надішлемо нове.' },
      { status: 400 },
    )
  }

  const studio = getStudio(link.studio)
  if (!studio) return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })

  let debt: Awaited<ReturnType<typeof readMkDebt>>
  try {
    debt = await readMkDebt(link)
  } catch (error) {
    console.error('[pay-mk] не вдалось прочитати запис:', error)
    return NextResponse.json({ error: 'Не вдалось перевірити запис. Спробуйте ще раз.' }, { status: 500 })
  }

  if (!debt) {
    return NextResponse.json(
      { error: 'Запис не знайдено. Можливо, його скасували — напишіть нам.' },
      { status: 404 },
    )
  }
  if (debt.due <= 0) {
    return NextResponse.json({ error: 'За цим записом уже все сплачено.' }, { status: 409 })
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!
    const spreadsheetId = getSpreadsheetId(link.studio)

    // Вебхук знайде запис за тими самими ім'ям і часом, що й ми зараз:
    // номер рядка зберігати не можна, бо рядки зсуваються при видаленні
    const id = await savePendingOrder({
      kind: 'mk-afterpay',
      studio: link.studio,
      client: debt.client,
      mkKey: link.mkKey,
    }, spreadsheetId)

    const { invoiceUrl } = await createInvoice({
      orderReference: encodePendingRef(link.studio, id),
      description: `Доплата за майстер-клас ${debt.mkDatetime}`.slice(0, 120),
      amount: debt.due,
      returnUrl: `${baseUrl}/api/payment/return?studio=${link.studio}`,
    })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (error) {
    console.error('[pay-mk] не вдалось створити рахунок:', error)
    return NextResponse.json(
      { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз.' },
      { status: 500 },
    )
  }
}
