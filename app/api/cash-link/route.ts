import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSlotById } from '@/lib/google-sheets'
import { STUDIOS, getSpreadsheetId } from '@/lib/studios'
import {
  decodeCashLink, encodeCashLink, isCashLinkUsed, newCashLinkId,
} from '@/lib/cash-link'

// POST — адміністратор виписує посилання на запис готівкою.
// GET  — сама сторінка запису питає, чи посилання ще живе.

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 })
  // Пустити людину без онлайн-оплати — рішення власниці, не майстрині
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Лише для адміністратора' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const studioId = String(body.studio ?? '')
  const slotId   = String(body.slot ?? '')
  const max      = Number(body.max)

  const studio = STUDIOS[studioId]
  if (!studio) return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  if (!slotId) return NextResponse.json({ error: 'Не вказано майстер-клас' }, { status: 400 })
  if (!Number.isInteger(max) || max < 1) {
    return NextResponse.json({ error: 'Вкажіть кількість учасників' }, { status: 400 })
  }

  const slot = await getSlotById(slotId, getSpreadsheetId(studioId)).catch(() => null)
  if (!slot) {
    return NextResponse.json(
      { error: 'Цей майстер-клас уже недоступний або заповнений' },
      { status: 404 },
    )
  }
  if (max > slot.spotsRemaining) {
    return NextResponse.json(
      { error: `Вільних місць лише ${slot.spotsRemaining}` },
      { status: 409 },
    )
  }

  const token = encodeCashLink({
    studio: studioId, slot: slotId, max,
    id: newCashLinkId(), issued: Date.now(),
  })

  // Адресу сайта доклеює браузер (`window.location.origin`), як і для решти
  // посилань в адмінці: так воно працює і локально, і на тестовому Vercel
  return NextResponse.json({
    token,
    path: `${studio.basePath}?cash=${encodeURIComponent(token)}`,
  })
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('d') ?? ''
  const link = decodeCashLink(token)
  if (!link) return NextResponse.json({ state: 'invalid' })

  const studio = STUDIOS[link.studio]
  if (!studio) return NextResponse.json({ state: 'invalid' })

  try {
    if (await isCashLinkUsed(link)) return NextResponse.json({ state: 'used' })

    // getSlots не віддає ані минулі МК, ані заповнені — тож «немає слота»
    // означає «запізнились», а не помилку
    const slot = await getSlotById(link.slot, getSpreadsheetId(link.studio))
    if (!slot) return NextResponse.json({ state: 'gone' })

    return NextResponse.json({
      state: 'ok',
      studio: link.studio,
      slot,
      max: Math.min(link.max, slot.spotsRemaining),
    })
  } catch (error) {
    console.error('[api/cash-link] GET', error)
    return NextResponse.json({ error: 'Не вдалося перевірити посилання' }, { status: 500 })
  }
}
