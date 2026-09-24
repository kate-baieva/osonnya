import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySession, type Session } from './auth'

// Читання сесії в серверних компонентах і роутах (Node runtime).
export async function getSession(): Promise<Session | null> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return null

  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  return verifySession(token, secret)
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new Error('Немає активної сесії')
  return session
}
