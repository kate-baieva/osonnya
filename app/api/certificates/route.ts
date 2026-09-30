import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCertificates, getNextNumber, markIssued, sellCertificate, PAPER, DIGITAL } from '@/lib/certificates'
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

  try {
    const [list, nextNumber] = await Promise.all([
      getCertificates(resolved.studioId),
      getNextNumber(resolved.studioId),
    ])
    // Майстрині потрібні лише ті, за якими мають зайти
    const visible = resolved.session.role === 'admin' ? list : list.filter((c) => c.awaitingPickup)
    return NextResponse.json({ certificates: visible, nextNumber })
  } catch (error) {
    console.error('[api/certificates] GET', error)
    return NextResponse.json({ error: 'Не вдалося завантажити сертифікати' }, { status: 500 })
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

  try {
    if (body.action === 'issue') {
      const rowIndex = Number(body.rowIndex)
      if (!Number.isInteger(rowIndex) || rowIndex < 2) {
        return NextResponse.json({ error: 'Невідомий сертифікат' }, { status: 400 })
      }
      await markIssued(studioId, rowIndex)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'sell') {
      const client = String(body.client ?? '').trim()
      const amount = Number(body.amount) || 0
      const people = Number(body.people) || 0
      const mkType = String(body.mkType ?? '').trim()

      if (!client) return NextResponse.json({ error: "Вкажіть ім'я та прізвище" }, { status: 400 })
      if (!mkType) return NextResponse.json({ error: 'Оберіть формат майстер-класу' }, { status: 400 })
      if (people < 1) return NextResponse.json({ error: 'Вкажіть кількість учасників' }, { status: 400 })
      if (amount <= 0) return NextResponse.json({ error: 'Вкажіть суму' }, { status: 400 })

      const created = await sellCertificate(studioId, {
        client, amount, people, mkType,
        account: String(body.account ?? 'Готівка студія'),
        type: body.type === DIGITAL ? DIGITAL : PAPER,
      })
      return NextResponse.json(created)
    }

    return NextResponse.json({ error: 'Невідома дія' }, { status: 400 })
  } catch (error) {
    console.error('[api/certificates] POST', error)
    return NextResponse.json({ error: 'Не вдалося зберегти' }, { status: 500 })
  }
}
