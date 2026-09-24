import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createUser, listUsers, setUserActive, setUserPassword } from '@/lib/users'
import { generatePassword } from '@/lib/password'
import { STUDIOS } from '@/lib/studios'

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  try {
    const users = await listUsers()
    return NextResponse.json(users.map(({ passwordHash, ...safe }) => safe))
  } catch (error) {
    console.error('[api/users]', error)
    return NextResponse.json({ error: 'Не вдалося завантажити користувачів' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  let body: { name?: string; login?: string; role?: string; studio?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const login = (body.login ?? '').trim().toLowerCase()
  const role = body.role === 'admin' ? 'admin' : 'master'
  const studio = body.studio && STUDIOS[body.studio] ? body.studio : null

  if (!name) return NextResponse.json({ error: "Вкажіть ім'я" }, { status: 400 })
  if (!/^[a-z0-9._-]{3,}$/.test(login)) {
    return NextResponse.json(
      { error: 'Логін — латиниця, цифри, крапка або дефіс, від 3 символів' },
      { status: 400 },
    )
  }
  if (role === 'master' && !studio) {
    return NextResponse.json({ error: 'Оберіть студію для майстрині' }, { status: 400 })
  }

  try {
    const existing = await listUsers()
    if (existing.some((u) => u.login === login)) {
      return NextResponse.json({ error: 'Такий логін вже існує' }, { status: 409 })
    }

    const password = generatePassword()
    await createUser({ name, login, role, studio, password })
    return NextResponse.json({ login, password })
  } catch (error) {
    console.error('[api/users] create', error)
    return NextResponse.json({ error: 'Не вдалося створити користувача' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  let body: { rowIndex?: number; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const rowIndex = Number(body.rowIndex)
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    return NextResponse.json({ error: 'Невідомий користувач' }, { status: 400 })
  }

  try {
    if (body.action === 'reset-password') {
      const password = generatePassword()
      await setUserPassword(rowIndex, password)
      return NextResponse.json({ password })
    }
    if (body.action === 'deactivate' || body.action === 'activate') {
      await setUserActive(rowIndex, body.action === 'activate')
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Невідома дія' }, { status: 400 })
  } catch (error) {
    console.error('[api/users] patch', error)
    return NextResponse.json({ error: 'Не вдалося зберегти зміни' }, { status: 500 })
  }
}
