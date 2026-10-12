import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { checkConnection, disconnect } from '@/lib/drive-oauth'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  const configured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  if (!configured) return NextResponse.json({ configured, status: 'none' })

  try {
    // Перевіряємо по-справжньому: токен може лежати в таблиці й бути мертвим
    return NextResponse.json({ configured, status: await checkConnection() })
  } catch {
    return NextResponse.json({ configured, status: 'none' })
  }
}

export async function DELETE() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }
  await disconnect()
  return NextResponse.json({ ok: true })
}
