import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPromoRecord, generatePromoCode } from '@/lib/google-sheets'
import { getStudio, getSpreadsheetId } from '@/lib/studios'

const bodySchema = z.object({
  studio:          z.string().min(1),
  contact:         z.string().min(1).max(120),
  discountPercent: z.number().positive().max(100),
  mkType:          z.string().min(1).max(40), // 'group' | 'individual' | 'any'
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

  const { studio: studioId, contact, discountPercent, mkType } = parsed.data
  const studio = getStudio(studioId)
  if (!studio) return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })

  const code = generatePromoCode()
  try {
    await createPromoRecord({ contact, discountPercent, mkType, code }, getSpreadsheetId(studioId))
  } catch (err) {
    console.error('[create-promo] ❌', err)
    return NextResponse.json({ error: 'Помилка збереження промокоду. Спробуйте ще раз.' }, { status: 500 })
  }

  return NextResponse.json({ code, discountPercent, mkType })
}
