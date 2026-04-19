import { NextRequest, NextResponse } from 'next/server'
import { registrationSchema } from '@/lib/validation'
import { getSlotById, findOrCreateClient, appendOrder } from '@/lib/google-sheets'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Помилка валідації', fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { slotId, name, surname, phone, instagram, peopleCount } = parsed.data

  // Перевіряємо, що слот ще існує та має місця
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

  try {
    const clientFullName = await findOrCreateClient(name, surname, phone, instagram)
    await appendOrder({
      clientFullName,
      mkDatetime: slot.datetime,
      peopleCount,
    })
  } catch (err) {
    console.error('[POST /api/register]', err)
    return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Реєстрацію підтверджено!' })
}
