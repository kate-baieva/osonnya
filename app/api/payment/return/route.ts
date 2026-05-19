import { NextRequest, NextResponse } from 'next/server'
import { getStudio } from '@/lib/studios'

// WayForPay повертає клієнта через POST або GET після оплати
function makeRedirect(req: NextRequest): NextResponse {
  const studioId = req.nextUrl.searchParams.get('studio') ?? 'sumy'
  const studio = getStudio(studioId)
  const successPath = studio?.successPath ?? '/success'
  return NextResponse.redirect(
    new URL(successPath, process.env.NEXT_PUBLIC_BASE_URL!),
    { status: 303 }
  )
}

export async function POST(req: NextRequest) {
  return makeRedirect(req)
}

export async function GET(req: NextRequest) {
  return makeRedirect(req)
}
