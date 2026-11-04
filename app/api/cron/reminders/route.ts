import { NextResponse } from 'next/server'
import { getOrders, markReminded, type Order } from '@/lib/orders'
import { STUDIOS, getStudio } from '@/lib/studios'
import { sendReminder, parseMkDatetime, safeSend, money } from '@/lib/client-mail'
import { getTransport } from '@/lib/mailer'

// Нагадування напередодні майстер-класу. Розклад — у vercel.json, 18:00.
//
// За умовчанням крон **нічого не надсилає клієнтам**, а шле список студії:
// перший запуск на бойових даних розіслав би листи всім одразу, без нагоди
// подивитись, кому саме. Щоб увімкнути справжню розсилку, у Vercel треба
// додати REMINDERS_ENABLED=1.
//
// Від повторів захищає колонка «Нагадано» в «MK Orders»: рядок, у якому вона
// заповнена, другого листа не отримує. Вона ж показує Кейт, кому лист пішов.

export const dynamic = 'force-dynamic'

/** Дата «завтра» в київському часі — сервер працює в UTC. */
function tomorrowInKyiv(): string {
  const now = new Date()
  const kyiv = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' })
  const [year, month, day] = kyiv.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return next.toISOString().slice(0, 10)
}

const ACTIVE_STATUSES = ['booked', 'certificate']

function isDue(order: Order, date: string): boolean {
  return order.mkKey.startsWith(date)
    && ACTIVE_STATUSES.includes(order.status.trim().toLowerCase())
    && order.reminded.trim() === ''
    && order.email.trim() !== ''
}

interface Planned {
  studioId: string
  order: Order
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Немає доступу' }, { status: 403 })
  }

  const date = tomorrowInKyiv()
  const planned: Planned[] = []
  const skipped: string[] = []

  for (const studioId of Object.keys(STUDIOS)) {
    let orders: Order[]
    try {
      orders = await getOrders(studioId)
    } catch (error) {
      console.error(`[cron/reminders] ${studioId}: записи не прочитались:`, (error as Error).message)
      continue
    }

    for (const order of orders) {
      if (isDue(order, date)) planned.push({ studioId, order })
      // Без пошти нагадати нема куди — показуємо це у звіті, щоб написали руками
      else if (order.mkKey.startsWith(date)
        && ACTIVE_STATUSES.includes(order.status.trim().toLowerCase())
        && order.reminded.trim() === ''
        && !order.email.trim()) {
        skipped.push(`${order.client} (${getStudio(studioId)?.city ?? studioId})`)
      }
    }
  }

  const enabled = process.env.REMINDERS_ENABLED === '1'

  if (!enabled) {
    await sendPreview(date, planned, skipped)
    return NextResponse.json({ ok: true, preview: true, planned: planned.length })
  }

  // ── Справжня розсилка ──────────────────────────────────────────────────
  const sentRows = new Map<string, number[]>()

  for (const { studioId, order } of planned) {
    const when = parseMkDatetime(order.mkDatetime)
    if (!when) continue

    let delivered = false
    await safeSend(`нагадування для «${order.client}»`, async () => {
      await sendReminder({
        studioId,
        to: order.email,
        mkDate: when.date,
        mkTime: when.time,
        peopleCount: order.people,
        paid: order.paid,
        due: order.debt,
      })
      delivered = true
    })

    if (!delivered) continue
    const rows = sentRows.get(studioId) ?? []
    rows.push(order.rowIndex)
    sentRows.set(studioId, rows)
  }

  // Відмітка — після листів: краще нагадати двічі, ніж жодного разу
  for (const [studioId, rows] of Array.from(sentRows.entries())) {
    try {
      await markReminded(studioId, rows, new Date().toLocaleDateString('uk-UA'))
    } catch (error) {
      console.error(`[cron/reminders] ${studioId}: відмітки не збереглись:`, (error as Error).message)
    }
  }

  const sent = Array.from(sentRows.values()).reduce((total, rows) => total + rows.length, 0)
  console.log(`[cron/reminders] надіслано ${sent} з ${planned.length} на ${date}`)

  return NextResponse.json({ ok: true, sent, planned: planned.length })
}

/**
 * Поки розсилка вимкнена — звіт студії замість листів клієнтам.
 * Так видно, кому саме пішло б, перш ніж вмикати по-справжньому.
 */
async function sendPreview(date: string, planned: Planned[], skipped: string[]): Promise<void> {
  const to = process.env.GMAIL_USER
  if (!to) return

  const rows = planned.map(({ studioId, order }) => {
    const when = parseMkDatetime(order.mkDatetime)
    const due = order.debt > 0 ? ` · до сплати ${money(order.debt)}` : ''
    return `<tr>
      <td style="padding:6px 10px; border-bottom:1px solid #eee;">${order.client}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee;">${order.email}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee;">
        ${getStudio(studioId)?.city ?? studioId}, ${when?.time ?? order.mkDatetime}${due}</td>
    </tr>`
  }).join('')

  const skippedHtml = skipped.length
    ? `<p style="color:#9b6b3a;"><strong>Без пошти — нагадати руками:</strong><br>${skipped.join('<br>')}</p>`
    : ''

  const html = `<div style="font-family: sans-serif; max-width: 640px; margin: 0 auto;">
    <h2 style="color:#9b6b3a;">Нагадування на ${date}: ${planned.length}</h2>
    <p style="color:#666;">Розсилка клієнтам <strong>вимкнена</strong> — це попередній
      перегляд. Щоб увімкнути, додайте в налаштуваннях Vercel
      <code>REMINDERS_ENABLED=1</code>.</p>
    ${planned.length
      ? `<table style="width:100%; border-collapse:collapse; font-size:14px;">${rows}</table>`
      : '<p>Завтра записів немає.</p>'}
    ${skippedHtml}
  </div>`

  try {
    await getTransport().sendMail({
      from: `"Осоння Бронювання" <${to}>`,
      to,
      subject: `Осоння: нагадування на ${date} — ${planned.length} (розсилка вимкнена)`,
      html,
    })
  } catch (error) {
    console.error('[cron/reminders] звіт не надіслано:', (error as Error).message)
  }
}
