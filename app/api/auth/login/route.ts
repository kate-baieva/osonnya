import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/users'
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from '@/lib/auth'

export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Сервер не налаштований' }, { status: 500 })
  }

  let login = ''
  let password = ''
  try {
    const body = await request.json()
    login = String(body.login ?? '')
    password = String(body.password ?? '')
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  if (!login.trim() || !password) {
    return NextResponse.json({ error: 'Введіть логін і пароль' }, { status: 400 })
  }

  const user = await authenticate(login, password)
  if (!user) {
    return NextResponse.json({ error: 'Невірний логін або пароль' }, { status: 401 })
  }

  const token = await signSession({ ...user, exp: Date.now() + SESSION_TTL_MS }, secret)

  const response = NextResponse.json({ role: user.role, name: user.name })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
  return response
}
