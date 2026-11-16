import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCertificates, getNextNumber, issueCertificate, sellCertificate, PAPER, DIGITAL } from '@/lib/certificates'
import { STUDIOS, getSpreadsheetId, getStudio } from '@/lib/studios'
import { findOrCreateClient } from '@/lib/google-sheets'
import { sendCertificateToBuyer, safeSend } from '@/lib/client-mail'
import { renderCertificateImage } from '@/lib/certificate-image'


// Лист покупцеві сертифіката, купленого в студії. Нічого з того, що тут
// станеться, не має ламати сам продаж: сертифікат уже записаний у таблицю,
// гроші взяті, і помилка пошти цього не скасовує.
async function sendToBuyer(data: {
  studioId: string
  email: string
  phone: string
  client: string
  mkType: string
  people: number
  amount: number
  type: string
  certCode: string
}): Promise<void> {
  const studio = getStudio(data.studioId)
  if (!studio) return

  const isGroup = data.mkType.toLowerCase().includes('груповий')
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 3)

  // Контакт зберігаємо окремо: наступного разу пошта знайдеться сама
  try {
    const parts = data.client.trim().split(/\s+/)
    await findOrCreateClient(
      parts[0] ?? '', parts.slice(1).join(' '), data.phone,
      undefined, getSpreadsheetId(data.studioId), data.email,
    )
  } catch (error) {
    console.warn('[api/certificates] контакт не збережено:', (error as Error).message)
  }

  let imageBuffer: Buffer | undefined
  if (data.type === DIGITAL) {
    try {
      imageBuffer = await renderCertificateImage({
        certCode: data.certCode, peopleCount: data.people, isGroup, expiresAt,
        instagram: studio.instagramHandle,
      })
    } catch (error) {
      // Без картинки лист усе одно корисний — у ньому є номер
      console.warn('[api/certificates] картинка не зібралась:', (error as Error).message)
    }
  }

  await safeSend('сертифікат покупцю', () => sendCertificateToBuyer({
    studioId: data.studioId,
    to: data.email,
    certCode: data.certCode,
    mkTypeLabel: data.mkType,
    isGroup,
    peopleCount: data.people,
    price: data.amount,
    expiresAt,
    imageBuffer,
    // Паперовий, куплений у студії, людина забирає тієї ж миті
    inHand: data.type !== DIGITAL,
  }))
}

async function resolve(request: Request, bodyStudio?: string) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 }) }
  if (session.role !== 'admin' && !session.studio) {
    return { error: NextResponse.json({ error: 'Студію не призначено' }, { status: 403 }) }
  }

  const studioId = session.role === 'admin'
    ? (bodyStudio ?? new URL(request.url).searchParams.get('studio') ?? '')
    : session.studio!

  if (!STUDIOS[studioId]) {
    return { error: NextResponse.json({ error: 'Невідома студія' }, { status: 400 }) }
  }
  return { session, studioId }
}

export async function GET(request: Request) {
  const resolved = await resolve(request)
  if ('error' in resolved) return resolved.error

  try {
    const [list, nextNumber] = await Promise.all([
      getCertificates(resolved.studioId),
      getNextNumber(resolved.studioId),
    ])
    // Майстрині потрібні лише ті, за якими мають зайти
    const visible = resolved.session.role === 'admin' ? list : list.filter((c) => c.awaitingPickup)
    return NextResponse.json({ certificates: visible, nextNumber })
  } catch (error) {
    console.error('[api/certificates] GET', error)
    return NextResponse.json({ error: 'Не вдалося завантажити сертифікати' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const resolved = await resolve(request, body.studio as string | undefined)
  if ('error' in resolved) return resolved.error
  const { studioId } = resolved

  try {
    if (body.action === 'issue') {
      const rowIndex = Number(body.rowIndex)
      if (!Number.isInteger(rowIndex) || rowIndex < 2) {
        return NextResponse.json({ error: 'Невідомий сертифікат' }, { status: 400 })
      }
      // Видача готівкового сертифіката заразом записує й оплату
      const issued = await issueCertificate(studioId, rowIndex)

      // TODO (окрема розмова про листи): якщо issued.paidNow > 0 —
      // sendCertificateToBuyer з `inHand: true` (сертифікат уже на руках).
      // Для куплених карткою лист пішов ще в мить оплати, тож не дублювати.
      // Пошту брати з «Clients» за іменем, як це робить findClientEmail.

      return NextResponse.json({ ok: true, ...issued })
    }

    if (body.action === 'sell') {
      const client = String(body.client ?? '').trim()
      const amount = Number(body.amount) || 0
      const people = Number(body.people) || 0
      const mkType = String(body.mkType ?? '').trim()

      if (!client) return NextResponse.json({ error: "Вкажіть ім'я та прізвище" }, { status: 400 })
      if (!mkType) return NextResponse.json({ error: 'Оберіть формат майстер-класу' }, { status: 400 })
      if (people < 1) return NextResponse.json({ error: 'Вкажіть кількість учасників' }, { status: 400 })
      if (amount <= 0) return NextResponse.json({ error: 'Вкажіть суму' }, { status: 400 })

      const type = body.type === DIGITAL ? DIGITAL : PAPER
      const created = await sellCertificate(studioId, {
        client, amount, people, mkType,
        account: String(body.account ?? 'Готівка студія'),
        type,
      })

      const email = String(body.email ?? '').trim()
      if (email) {
        await sendToBuyer({
          studioId, email, phone: String(body.phone ?? '').trim(),
          client, mkType, people, amount, type,
          certCode: created.number,
        })
      }

      return NextResponse.json({ ...created, emailed: Boolean(email) })
    }

    return NextResponse.json({ error: 'Невідома дія' }, { status: 400 })
  } catch (error) {
    console.error('[api/certificates] POST', error)
    return NextResponse.json({ error: 'Не вдалося зберегти' }, { status: 500 })
  }
}
