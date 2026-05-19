import { NextRequest, NextResponse } from 'next/server'
import { validateCertificate } from '@/lib/google-sheets'
import { getSpreadsheetId } from '@/lib/studios'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const code     = ((raw?.code as string ?? '')).trim()
  const studioId = (raw?.studio as string ?? 'sumy')

  if (!code) {
    return NextResponse.json({ error: 'Введіть код сертифікату' }, { status: 400 })
  }

  try {
    const result = await validateCertificate(code, getSpreadsheetId(studioId))

    if (!result.valid) {
      return NextResponse.json({ valid: false, reason: result.reason })
    }

    return NextResponse.json({
      valid: true,
      peopleCount: result.info.peopleCount,
      type: result.info.type,
      expiresAt: result.info.expiresAt.toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/validate-certificate]', err)
    return NextResponse.json({ error: 'Помилка перевірки. Спробуйте ще раз.' }, { status: 500 })
  }
}
