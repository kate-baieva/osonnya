import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    return new NextResponse('SESSION_SECRET не налаштований', { status: 500 })
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token, secret) : null

  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Адмінка — лише для адміністратора. Кабінет майстрині доступний і адміністратору.
  if (request.nextUrl.pathname.startsWith('/admin') && session.role !== 'admin') {
    return NextResponse.redirect(new URL('/master', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/master', '/master/:path*'],
}
