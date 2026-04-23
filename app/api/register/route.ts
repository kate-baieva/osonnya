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

  console.log('[POST /api/register] body:', JSON.stringify(body))

  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    console.log('[POST /api/register] ❌ валідація:', parsed.error.flatten().fieldErrors)
    return NextResponse.json(
      { error: 'Помилка валідації', fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  console.log('[POST /api/register] ✅ валідація пройшла')
  const { slotId, name, surname, phone, instagram, peopleCount } = parsed.data

  const slot = await getSlotById(slotId).catch((e) => {
    console.error('[POST /api/register] getSlotById error:', e)
    return null
  })
  console.log('[POST /api/register] slot:', slot)

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
    console.log('[POST /api/register] записую клієнта...')
    const clientFullName = await findOrCreateClient(name, surname, phone, instagram)
    console.log('[POST /api/register] клієнт:', clientFullName)

    console.log('[POST /api/register] записую замовлення...')
    await appendOrder({ clientFullName, mkDatetime: slot.datetime, peopleCount })
    console.log('[POST /api/register] ✅ успішно збережено')
  } catch (err) {
    console.error('[POST /api/register] ❌ помилка збереження:', err)
    return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Реєстрацію підтверджено!' })
}
