import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { PIECE_STATUSES, updateStatuses, type PieceStatus, type StatusChange } from '@/lib/pieces'
import { STUDIOS } from '@/lib/studios'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 })

  let body: { studio?: string; rowIndexes?: unknown; status?: string; comment?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  if (session.role !== 'admin' && !session.studio) {
    return NextResponse.json({ error: 'Студію не призначено' }, { status: 403 })
  }

  const studioId = session.role === 'admin' ? (body.studio ?? '') : session.studio!
  if (!STUDIOS[studioId]) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }

  const status = body.status as PieceStatus
  if (!PIECE_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Невідомий статус' }, { status: 400 })
  }

  const rowIndexes = Array.isArray(body.rowIndexes)
    ? body.rowIndexes.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : []
  if (rowIndexes.length === 0) {
    return NextResponse.json({ error: 'Не обрано жодного виробу' }, { status: 400 })
  }

  const comment = typeof body.comment === 'string' ? body.comment.trim() : undefined
  const changes: StatusChange[] = rowIndexes.map((rowIndex) => ({ rowIndex, status, comment }))

  try {
    await updateStatuses(studioId, changes, session.name)
    return NextResponse.json({ updated: changes.length })
  } catch (error) {
    console.error('[api/pieces/status]', error)
    return NextResponse.json({ error: 'Не вдалося зберегти зміни' }, { status: 500 })
  }
}
