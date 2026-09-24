import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPieces } from '@/lib/pieces'
import { STUDIOS } from '@/lib/studios'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 })

  // Майстриня бачить лише свою студію, адміністратор — будь-яку.
  // Якщо студію не призначено — доступу немає взагалі, а не «до будь-якої».
  if (session.role !== 'admin' && !session.studio) {
    return NextResponse.json({ error: 'Студію не призначено' }, { status: 403 })
  }

  const studioId = session.role === 'admin'
    ? new URL(request.url).searchParams.get('studio') ?? ''
    : session.studio!

  if (!STUDIOS[studioId]) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }

  try {
    const pieces = await getPieces(studioId)
    return NextResponse.json(pieces)
  } catch (error) {
    console.error('[api/pieces]', error)
    return NextResponse.json({ error: 'Не вдалося завантажити вироби' }, { status: 500 })
  }
}
