import { NextRequest, NextResponse } from 'next/server'
import { getStudio } from '@/lib/studios'

// WayForPay повертає клієнта через POST або GET після оплати
function makeRedirect(req: NextRequest): NextResponse {
  const base     = process.env.NEXT_PUBLIC_BASE_URL!
  const studioId = req.nextUrl.searchParams.get('studio') ?? 'sumy'
  const certCode = req.nextUrl.searchParams.get('certCode')
  const studio   = getStudio(studioId)

  // Покупка сертифіката — редірект на сторінку з кодом
  if (certCode) {
    const successUrl = new URL(`${studio?.basePath ?? '/sumy'}/certificate/success`, base)
    successUrl.searchParams.set('code', certCode)
    return NextResponse.redirect(successUrl, { status: 303 })
  }

  // Звичайне бронювання МК
  const successPath = studio?.successPath ?? '/success'
  return NextResponse.redirect(new URL(successPath, base), { status: 303 })
}

export async function POST(req: NextRequest) { return makeRedirect(req) }
export async function GET(req: NextRequest)  { return makeRedirect(req) }
