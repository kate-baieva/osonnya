import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { oauthClient, saveRefreshToken } from '@/lib/drive-oauth'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return new NextResponse('Немає доступу', { status: 403 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const denied = url.searchParams.get('error')

  if (denied || !code) {
    return NextResponse.redirect(new URL('/admin/profile?drive=denied', request.url))
  }

  try {
    const { tokens } = await oauthClient().getToken(code)
    if (!tokens.refresh_token) {
      // Google віддає refresh_token лише при першій згоді — знімаємо доступ і пробуємо знову
      return NextResponse.redirect(new URL('/admin/profile?drive=noref', request.url))
    }
    await saveRefreshToken(tokens.refresh_token)
    return NextResponse.redirect(new URL('/admin/profile?drive=ok', request.url))
  } catch (error) {
    console.error('[api/drive/callback]', error)
    return NextResponse.redirect(new URL('/admin/profile?drive=error', request.url))
  }
}
