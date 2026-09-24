import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPieces } from '@/lib/pieces'
import { STUDIOS } from '@/lib/studios'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 })

  const requested = new URL(request.url).searchParams.get('studio') ?? ''
  // Майстриня бачить лише свою студію, адміністратор — будь-яку.
  const studioId = session.role === 'admin' ? requested : session.studio ?? requested

  if (!STUDIOS[studioId]) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }
  if (session.role !== 'admin' && session.studio && session.studio !== studioId) {
    return NextResponse.json({ error: 'Немає доступу до цієї студії' }, { status: 403 })
  }

  try {
    const pieces = await getPieces(studioId)
    return NextResponse.json(pieces)
  } catch (error) {
    console.error('[api/pieces]', error)
    return NextResponse.json({ error: 'Не вдалося завантажити вироби' }, { status: 500 })
  }
}
