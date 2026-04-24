import { NextResponse } from 'next/server'

// WayForPay повертає клієнта через POST — приймаємо і редіректимо на /success
export async function POST() {
  return NextResponse.redirect(
    new URL('/success', process.env.NEXT_PUBLIC_BASE_URL!),
    { status: 303 }
  )
}

export async function GET() {
  return NextResponse.redirect(
    new URL('/success', process.env.NEXT_PUBLIC_BASE_URL!),
    { status: 303 }
  )
}
