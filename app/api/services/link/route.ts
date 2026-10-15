import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { isCategory } from '@/lib/service-categories'
import { encodeServiceLink } from '@/lib/service-link'
import { STUDIOS } from '@/lib/studios'

// Посилання підписується на сервері: у браузері немає SESSION_SECRET,
// та й не повинно бути

export async function POST(request: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const studio = String(body.studio ?? '')
  if (!STUDIOS[studio]) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }

  const category = String(body.category ?? '')
  if (!isCategory(category)) {
    return NextResponse.json({ error: 'Оберіть категорію' }, { status: 400 })
  }

  const comment = String(body.comment ?? '').trim()
  if (!comment) {
    return NextResponse.json({ error: 'Опишіть послугу' }, { status: 400 })
  }
  if (comment.length > 200) {
    return NextResponse.json({ error: 'Опис задовгий — до 200 символів' }, { status: 400 })
  }

  const amount = Math.round(Number(body.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Вкажіть суму більшу за нуль' }, { status: 400 })
  }

  const token = encodeServiceLink({
    studio, category, comment, amount, issued: Date.now(),
  })

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
  const url = `${base}${STUDIOS[studio].basePath}/service?d=${encodeURIComponent(token)}`

  return NextResponse.json({ url })
}
