import { NextRequest, NextResponse } from 'next/server'
import { validatePromo } from '@/lib/google-sheets'
import { getSpreadsheetId } from '@/lib/studios'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const code     = ((raw?.code as string ?? '')).trim()
  const studioId = (raw?.studio as string ?? 'sumy')
  const mkType   = (raw?.mkType as string | undefined) // 'group' для групового МК

  if (!code) return NextResponse.json({ error: 'Введіть промокод' }, { status: 400 })

  try {
    const result = await validatePromo(code, getSpreadsheetId(studioId), mkType)
    if (!result.valid) return NextResponse.json({ valid: false, reason: result.reason })
    return NextResponse.json({ valid: true, discountPercent: result.info.discountPercent })
  } catch (err) {
    console.error('[validate-promo]', err)
    return NextResponse.json({ error: 'Помилка перевірки. Спробуйте ще раз.' }, { status: 500 })
  }
}
