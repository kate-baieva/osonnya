import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createInvoice, encodePendingRef } from '@/lib/wayforpay'
import { findOrCreateClient, savePendingOrder } from '@/lib/google-sheets'
import { decodeServiceLink } from '@/lib/service-link'
import { categoryLabel } from '@/lib/service-categories'
import { getSpreadsheetId, getStudio } from '@/lib/studios'

const bodySchema = z.object({
  d:       z.string().min(1),
  name:    z.string().min(2, 'Введіть ім\'я').max(50),
  surname: z.string().min(2, 'Введіть прізвище').max(50),
  phone:   z.string().min(1).regex(/^\+?3?8?0?\d{9}$|^0\d{9}$/, 'Некоректний телефон'),
  email:   z.string().email('Некоректний email').max(100),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Помилка валідації', fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { d, name, surname, phone, email } = parsed.data

  // Сума, категорія й опис беруться ВИКЛЮЧНО з підписаного посилання.
  // Усе, що клієнт надсилає окремо, на них не впливає.
  const service = decodeServiceLink(d)
  if (!service) {
    return NextResponse.json(
      { error: 'Посилання недійсне або змінене. Попросіть студію надіслати нове.' },
      { status: 400 },
    )
  }

  const studio = getStudio(service.studio)
  if (!studio) return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })

  const spreadsheetId = getSpreadsheetId(service.studio)

  // Контакт зберігаємо до оплати: email не влазить у номер замовлення,
  // а вебхук потім знайде цей самий запис і не створить дубль
  try {
    await findOrCreateClient(name, surname, phone, undefined, spreadsheetId, email)
  } catch (err) {
    console.warn('[pay-service] не вдалось зберегти контакт:', err)
  }

  try {
    const id = await savePendingOrder({
      kind: 'service',
      name, surname, phone, email,
      category: service.category,
      comment: service.comment,
      amount: service.amount,
    }, spreadsheetId)

    const { invoiceUrl } = await createInvoice({
      orderReference: encodePendingRef(service.studio, id),
      description: `${categoryLabel(service.category)} · ${service.comment}`.slice(0, 120),
      amount: service.amount,
      returnUrl: `${process.env.NEXT_PUBLIC_BASE_URL}${studio.basePath}/service/success`,
    })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (err) {
    console.error('[pay-service] ❌ WayForPay:', err)
    return NextResponse.json(
      { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз.' },
      { status: 500 },
    )
  }
}
