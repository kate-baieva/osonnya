import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  addScheduleEntry, assignMaster, getSchedule,
  type MkType, type ScheduleSource,
} from '@/lib/schedule'
import { STUDIOS } from '@/lib/studios'

const TYPES: MkType[] = ['group', 'indiv', 'kids']
const SOURCES: ScheduleSource[] = ['group', 'reserved', 'individual']

async function resolveStudio(request: Request, bodyStudio?: string) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 }) }

  if (session.role !== 'admin' && !session.studio) {
    return { error: NextResponse.json({ error: 'Студію не призначено' }, { status: 403 }) }
  }

  const requested = session.role === 'admin'
    ? (bodyStudio ?? new URL(request.url).searchParams.get('studio') ?? '')
    : session.studio!

  if (!STUDIOS[requested]) {
    return { error: NextResponse.json({ error: 'Невідома студія' }, { status: 400 }) }
  }
  return { session, studioId: requested }
}

export async function GET(request: Request) {
  const resolved = await resolveStudio(request)
  if ('error' in resolved) return resolved.error

  const past = new URL(request.url).searchParams.get('past') === '1'

  try {
    const items = await getSchedule(resolved.studioId, { past })
    return NextResponse.json(items)
  } catch (error) {
    console.error('[api/schedule] GET', error)
    return NextResponse.json({ error: 'Не вдалося завантажити розклад' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const resolved = await resolveStudio(request, body.studio as string | undefined)
  if ('error' in resolved) return resolved.error
  if (resolved.session.role !== 'admin') {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  const type = body.type as MkType
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: 'Невідомий тип майстер-класу' }, { status: 400 })
  }

  const date = String(body.date ?? '')
  const time = String(body.time ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Вкажіть дату й час' }, { status: 400 })
  }

  const capacity = type === 'kids' ? 0 : Math.max(0, Number(body.capacity) || 0)
  if (type === 'group' && capacity < 1) {
    return NextResponse.json({ error: 'Вкажіть кількість місць' }, { status: 400 })
  }

  try {
    await addScheduleEntry(resolved.studioId, {
      type, date, time, capacity,
      title: String(body.title ?? '').trim(),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/schedule] POST', error)
    return NextResponse.json({ error: 'Не вдалося додати в розклад' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const resolved = await resolveStudio(request, body.studio as string | undefined)
  if ('error' in resolved) return resolved.error
  if (resolved.session.role !== 'admin') {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  // Раніше тут будь-що незнайоме ставало 'group', і майстриня
  // індивідуального МК ішла в чужий аркуш за номером рядка. Тепер
  // незнайоме джерело — помилка, а не припущення.
  const source = SOURCES.find((value) => value === body.source)
  if (!source) {
    return NextResponse.json({ error: 'Невідоме джерело рядка' }, { status: 400 })
  }

  const rowIndex = Number(body.rowIndex)
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    return NextResponse.json({ error: 'Невідомий рядок' }, { status: 400 })
  }

  try {
    await assignMaster(resolved.studioId, { source, rowIndex }, String(body.master ?? '').trim())
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/schedule] PATCH', error)
    return NextResponse.json({ error: 'Не вдалося зберегти майстриню' }, { status: 500 })
  }
}
