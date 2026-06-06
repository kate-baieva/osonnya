import { NextResponse } from 'next/server'
import { sendPaperCertNotification } from '@/lib/mailer'

export async function GET() {
  try {
    await sendPaperCertNotification({
      certCode: 'WEB-TEST1',
      mkType: 'Парний МК',
      peopleCount: 2,
      price: 2200,
      buyerName: 'Тестова Людина',
      buyerPhone: '0501234567',
      buyerInstagram: '@test.user',
      studioName: 'Осоння Суми',
    })
    return NextResponse.json({ ok: true, message: 'Лист надіслано!' })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
