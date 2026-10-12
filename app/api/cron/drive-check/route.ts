import { NextResponse } from 'next/server'
import { checkConnection } from '@/lib/drive-oauth'
import { getSetting, setSetting } from '@/lib/app-settings'
import { sendDriveBrokenNotice } from '@/lib/mailer'

// Щотижнева перевірка доступу до Drive. Поломку інакше видно лише тоді,
// коли хтось помітить порожню колонку «Фото» — а це тижні.
// Розклад — у vercel.json.

export const dynamic = 'force-dynamic'

const CHECKED_AT = 'drive_checked_at'
const MIN_GAP_MS = 20 * 60 * 60 * 1000 // не частіше разу на добу

export async function GET(request: Request) {
  // Vercel надсилає цей заголовок, якщо в налаштуваннях заданий CRON_SECRET.
  // Поки його немає, захистом слугує обмеження частоти нижче: стороннім
  // викликом можна щонайбільше разок на добу спричинити один лист собі ж.
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  const last = await getSetting(CHECKED_AT)
  const lastTime = last ? Date.parse(last) : NaN
  if (!isNaN(lastTime) && Date.now() - lastTime < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, skipped: 'перевіряли нещодавно' })
  }

  const status = await checkConnection()
  await setSetting(CHECKED_AT, new Date().toISOString())

  if (status === 'expired') {
    try {
      await sendDriveBrokenNotice(process.env.NEXT_PUBLIC_BASE_URL ?? '')
      console.warn('[cron/drive-check] доступ до Drive злетів, лист надіслано')
    } catch (error) {
      console.error('[cron/drive-check] лист не надіслано:', (error as Error).message)
    }
  }

  // Назовні статус не віддаємо — маршрут може бути відкритим
  return NextResponse.json({ ok: true })
}
