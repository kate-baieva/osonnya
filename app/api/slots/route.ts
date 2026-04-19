import { NextResponse } from 'next/server'
import { getSlots } from '@/lib/google-sheets'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const slots = await getSlots()
    return NextResponse.json(slots)
  } catch (err) {
    console.error('[GET /api/slots]', err)
    return NextResponse.json({ error: 'Не вдалося завантажити слоти' }, { status: 500 })
  }
}
