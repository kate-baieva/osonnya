import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  addPayment, addWalkIn, getOrdersForMk, moveOrder, setAttendance, setOrderStatus,
} from '@/lib/orders'
import { getSchedule, syncEventForSlot } from '@/lib/schedule'
import { getPiecesForMk } from '@/lib/pieces'
import { STUDIOS } from '@/lib/studios'

async function resolve(request: Request, bodyStudio?: string) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 }) }
  if (session.role !== 'admin' && !session.studio) {
    return { error: NextResponse.json({ error: 'Студію не призначено' }, { status: 403 }) }
  }

  const studioId = session.role === 'admin'
    ? (bodyStudio ?? new URL(request.url).searchParams.get('studio') ?? '')
    : session.studio!

  if (!STUDIOS[studioId]) {
    return { error: NextResponse.json({ error: 'Невідома студія' }, { status: 400 }) }
  }
  return { session, studioId }
}

export async function GET(request: Request) {
  const resolved = await resolve(request)
  if ('error' in resolved) return resolved.error

  const mkKey = new URL(request.url).searchParams.get('at') ?? ''
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(mkKey)) {
    return NextResponse.json({ error: 'Не вказано майстер-клас' }, { status: 400 })
  }

  try {
    const [orders, pieces, upcoming, past] = await Promise.all([
      getOrdersForMk(resolved.studioId, mkKey),
      getPiecesForMk(resolved.studioId, mkKey),
      getSchedule(resolved.studioId),
      getSchedule(resolved.studioId, { past: true }),
    ])
    const slot = [...upcoming, ...past].find((item) => `${item.date} ${item.time}` === mkKey) ?? null

    return NextResponse.json({ mkKey, slot, orders, pieces })
  } catch (error) {
    console.error('[api/mk] GET', error)
    return NextResponse.json({ error: 'Не вдалося завантажити майстер-клас' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const resolved = await resolve(request, body.studio as string | undefined)
  if ('error' in resolved) return resolved.error
  const { studioId } = resolved

  const action = String(body.action ?? '')

  try {
    if (action === 'payment') {
      const rowIndex = Number(body.rowIndex)
      const amount = Number(body.amount)
      if (!Number.isInteger(rowIndex) || rowIndex < 2) {
        return NextResponse.json({ error: 'Невідомий запис' }, { status: 400 })
      }
      if (!(amount > 0)) {
        return NextResponse.json({ error: 'Вкажіть суму' }, { status: 400 })
      }
      await addPayment(studioId, rowIndex, {
        amount,
        account: String(body.account ?? 'Готівка студія'),
        date: typeof body.date === 'string' && body.date ? body.date : undefined,
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'attendance') {
      const rowIndex = Number(body.rowIndex)
      const attended = Number(body.attended)
      if (!Number.isInteger(rowIndex) || rowIndex < 2 || !(attended >= 0)) {
        return NextResponse.json({ error: 'Некоректні дані' }, { status: 400 })
      }
      await setAttendance(studioId, rowIndex, attended)
      return NextResponse.json({ ok: true })
    }

    if (action === 'walk-in') {
      const client = String(body.client ?? '').trim()
      const mkDatetime = String(body.mkDatetime ?? '').trim()
      const people = Number(body.people) || 0
      if (!client) return NextResponse.json({ error: "Вкажіть ім'я" }, { status: 400 })
      if (!mkDatetime) return NextResponse.json({ error: 'Невідомий майстер-клас' }, { status: 400 })
      if (people < 1) return NextResponse.json({ error: 'Вкажіть кількість осіб' }, { status: 400 })

      await addWalkIn(studioId, {
        client, mkDatetime, people,
        amount: Number(body.amount) || 0,
        paid: Number(body.paid) || 0,
        account: String(body.account ?? 'Готівка студія'),
        type: String(body.type ?? 'group'),
        certificate: String(body.certificate ?? '') || undefined,
        promo: String(body.promo ?? '') || undefined,
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel' || action === 'restore') {
      if (resolved.session.role !== 'admin') {
        return NextResponse.json({ error: 'Скасовувати записи може адміністратор' }, { status: 403 })
      }
      const rowIndex = Number(body.rowIndex)
      const mkDatetime = String(body.mkDatetime ?? '')
      if (!Number.isInteger(rowIndex) || rowIndex < 2) {
        return NextResponse.json({ error: 'Невідомий запис' }, { status: 400 })
      }

      // Місця рахуються лише для статусу «booked» — інший статус звільняє місце
      await setOrderStatus(studioId, rowIndex, action === 'cancel' ? 'cancelled' : 'booked')
      if (mkDatetime) await syncEventForSlot(studioId, mkDatetime)
      return NextResponse.json({ ok: true })
    }

    if (action === 'move') {
      if (resolved.session.role !== 'admin') {
        return NextResponse.json({ error: 'Переносити записи може адміністратор' }, { status: 403 })
      }
      const rowIndex = Number(body.rowIndex)
      const from = String(body.from ?? '')
      const to = String(body.to ?? '')
      if (!Number.isInteger(rowIndex) || rowIndex < 2) {
        return NextResponse.json({ error: 'Невідомий запис' }, { status: 400 })
      }
      if (!to) return NextResponse.json({ error: 'Оберіть майстер-клас' }, { status: 400 })

      await moveOrder(studioId, rowIndex, to)
      // Оновлюємо обидві події: і ту, звідки пішли, і ту, куди перенесли
      if (from) await syncEventForSlot(studioId, from)
      await syncEventForSlot(studioId, to)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Невідома дія' }, { status: 400 })
  } catch (error) {
    console.error('[api/mk] POST', error)
    return NextResponse.json({ error: 'Не вдалося зберегти' }, { status: 500 })
  }
}
