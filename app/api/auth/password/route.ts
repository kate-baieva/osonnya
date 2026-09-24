import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { authenticate, createUser, listUsers, setUserPassword } from '@/lib/users'
import { SESSION_COOKIE } from '@/lib/auth'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 })

  let body: { current?: string; next?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const current = String(body.current ?? '')
  const next = String(body.next ?? '')

  if (next.length < 8) {
    return NextResponse.json({ error: 'Новий пароль має бути не коротшим за 8 символів' }, { status: 400 })
  }
  if (!(await authenticate(session.login, current))) {
    return NextResponse.json({ error: 'Поточний пароль неправильний' }, { status: 403 })
  }

  try {
    const user = (await listUsers()).find((u) => u.login === session.login)
    if (user) {
      await setUserPassword(user.rowIndex, next)
    } else {
      // Вхід був через обліковий запис із змінних оточення — створюємо справжній.
      await createUser({
        name: session.name,
        login: session.login,
        role: session.role,
        studio: session.studio,
        password: next,
      })
    }
  } catch (error) {
    console.error('[api/auth/password]', error)
    return NextResponse.json({ error: 'Не вдалося зберегти пароль' }, { status: 500 })
  }

  // Старий пароль більше не діє — змушуємо увійти заново.
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
