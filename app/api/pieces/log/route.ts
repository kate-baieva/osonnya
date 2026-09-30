import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getLog } from '@/lib/piece-log'
import { STUDIOS } from '@/lib/studios'

// Історію змін виробу бачить адміністратор
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  const params = new URL(request.url).searchParams
  const studioId = params.get('studio') ?? ''
  const number = params.get('number') ?? ''

  if (!STUDIOS[studioId]) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }
  if (!number.trim()) {
    return NextResponse.json({ error: 'Не вказано виріб' }, { status: 400 })
  }

  return NextResponse.json(await getLog(studioId, number))
}
