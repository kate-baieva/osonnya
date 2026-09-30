import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySession, type Session } from './auth'
import { sessionStillValid } from './users'

// Підпису недостатньо: користувача могли вимкнути, видалити або
// перевипустити йому пароль уже після того, як він увійшов. Тому щоразу
// звіряємось із таблицею — читання кешується, тож це дешево.
export async function getSession(): Promise<Session | null> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return null

  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await verifySession(token, secret)
  if (!session) return null

  return (await sessionStillValid(session)) ? session : null
}

// Для сторінок: якщо доступ відкликали, відправляємо на вхід одразу,
// а не показуємо порожній кабінет
export async function requirePage(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}
