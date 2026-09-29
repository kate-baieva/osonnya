import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { consentUrl } from '@/lib/drive-oauth'

// Під'єднати Drive може лише адміністратор — фото вантажаться від її імені
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return new NextResponse('Немає доступу', { status: 403 })
  }

  try {
    return NextResponse.redirect(consentUrl())
  } catch (error) {
    console.error('[api/drive/connect]', error)
    return new NextResponse('OAuth-клієнт не налаштований', { status: 500 })
  }
}
