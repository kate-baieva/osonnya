import { NextRequest, NextResponse } from 'next/server'
import { getSlots } from '@/lib/google-sheets'
import { getSpreadsheetId } from '@/lib/studios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const studioId = req.nextUrl.searchParams.get('studio') ?? 'sumy'
  try {
    const slots = await getSlots(getSpreadsheetId(studioId))
    return NextResponse.json(slots)
  } catch (err) {
    console.error('[GET /api/slots]', err)
    return NextResponse.json({ error: 'Не вдалося завантажити слоти' }, { status: 500 })
  }
}
