import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { disconnect, isConnected } from '@/lib/drive-oauth'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  const configured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  try {
    return NextResponse.json({ configured, connected: configured && await isConnected() })
  } catch {
    return NextResponse.json({ configured, connected: false })
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
