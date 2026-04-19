import { NextRequest, NextResponse } from 'next/server'
import { registrationSchema } from '@/lib/validation'
import { getSlotById, appendRegistration, incrementRegistered } from '@/lib/google-sheets'

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

  const { slotId, name, phone, peopleCount } = parsed.data

  // Re-fetch slot to confirm capacity is still available
  const found = await getSlotById(slotId).catch(() => null)
  if (!found) {
    return NextResponse.json({ error: 'Слот не знайдено або вже недоступний' }, { status: 404 })
  }

  const { slot, rowIndex } = found
  if (slot.spotsRemaining < peopleCount) {
    return NextResponse.json(
      { error: `На цей майстер-клас залишилось лише ${slot.spotsRemaining} місць` },
      { status: 409 }
    )
  }

  try {
    await appendRegistration({
      slotId,
      slotDate: slot.date,
      slotTime: slot.time,
      name,
      phone,
      peopleCount,
    })
    // Increment once per registration (not per person)
    await incrementRegistered(rowIndex)
  } catch (err) {
    console.error('[POST /api/register]', err)
    return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Реєстрацію підтверджено!' })
}
