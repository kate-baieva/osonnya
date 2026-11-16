import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createInvoice, encodeOrderData } from '@/lib/wayforpay'
import { createCertificateRecord, findOrCreateClient, getAllMkPrices, getNextCertNumber } from '@/lib/google-sheets'
import { resolveCertificatePrice } from '@/lib/pricing'
import { MK_TYPE_GROUP, MK_TYPE_INDIVIDUAL } from '@/lib/mk-type'
import { sendPaperCertNotification, sendDigitalCertEmail } from '@/lib/mailer'
import { sendCertificateToBuyer, safeSend } from '@/lib/client-mail'
import { renderCertificateImage } from '@/lib/certificate-image'
import { getStudio, getSpreadsheetId } from '@/lib/studios'

// Термін дії сертифіката — 3 місяці від сьогодні
function certExpiry(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + 3)
  return d
}

const bodySchema = z.object({
  studio:      z.string().min(1),
  mkLabel:     z.string().min(1).max(120),
  peopleCount: z.number().int().positive().max(50),
  // price клієнта НЕ використовується — ціна рахується на сервері (захист від підробки)
  price:       z.number().positive().optional(),
  name:        z.string().min(2).max(50),
  surname:     z.string().min(2).max(50),
  phone:       z.string().min(1).regex(/^\+?3?8?0?\d{9}$|^0\d{9}$/, 'Некоректний телефон'),
  instagram:   z.string().min(1).max(100),
  email:       z.string().email('Некоректний email').max(100),
  certType:    z.enum(['paper', 'digital']).default('paper'),
  // Готівка — для тих, кому незручно платити карткою: сертифікат відкладається,
  // а гроші беруть у студії, коли людина приходить його забирати
  payMethod:   z.enum(['card', 'cash']).default('card'),
  skipPayment: z.boolean().optional(),
})


export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Помилка валідації', fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { studio: studioId, mkLabel, peopleCount,
          name, surname, phone, instagram, email, certType, payMethod, skipPayment } = parsed.data

  // Електронний сертифікат надсилає сам сайт одразу після оплати — готівкою
  // це не працює. Форма це вже не дає вибрати, тут — остання перевірка
  if (payMethod === 'cash' && certType === 'digital') {
    return NextResponse.json(
      { error: 'Електронний сертифікат можна оплатити лише карткою' },
      { status: 400 },
    )
  }

  const studio = getStudio(studioId)
  if (!studio) return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })

  const spreadsheetId = getSpreadsheetId(studioId)

  // ── Ціна рахується на сервері з таблиці Prices (НЕ довіряємо клієнту) ──────
  let price: number
  try {
    const prices = await getAllMkPrices(spreadsheetId)
    const resolved = resolveCertificatePrice(prices, mkLabel, peopleCount)
    if (resolved === null) {
      return NextResponse.json(
        { error: 'Невідомий формат майстер-класу або кількість учасників' },
        { status: 400 }
      )
    }
    price = resolved
  } catch (err) {
    console.error('[buy-certificate] ❌ price lookup:', err)
    return NextResponse.json({ error: 'Помилка розрахунку ціни. Спробуйте ще раз.' }, { status: 500 })
  }

  // Числовий номер сертифіката (продовжує наявну нумерацію в таблиці)
  let certCode: string
  try {
    certCode = await getNextCertNumber(spreadsheetId)
  } catch (err) {
    console.error('[buy-certificate] ❌ getNextCertNumber:', err)
    return NextResponse.json({ error: 'Помилка генерації номера. Спробуйте ще раз.' }, { status: 500 })
  }
  const baseUrl  = process.env.NEXT_PUBLIC_BASE_URL!
  const isGroup  = mkLabel.toLowerCase().includes('груповий')

  // ── Оплата готівкою в студії ───────────────────────────────────────────────
  // Сертифікат створюється одразу, але без дати оплати — у «Чекають видачі»
  // він світиться як неоплачений. Номер покупцю не віддаємо: поки гроші не
  // внесені, ним можна було б записатись на МК безкоштовно.
  if (payMethod === 'cash') {
    try {
      const clientFullName = await findOrCreateClient(
        name, surname, phone, instagram, spreadsheetId, email,
      )
      await createCertificateRecord({
        buyerName: clientFullName,
        buyerPhone: phone,
        buyerInstagram: instagram,
        peopleCount,
        mkType: isGroup ? MK_TYPE_GROUP : MK_TYPE_INDIVIDUAL,
        price,
        certCode,
        kind: 'паперовий',
        paid: false,
      }, spreadsheetId)
      console.log(`[buy-certificate] ✅ сертифікат ${certCode} відкладено під готівку`)
    } catch (err) {
      console.error('[buy-certificate] ❌ cash save:', err)
      return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
    }

    // TODO (окрема розмова про листи): sendCertificateOrderCash покупцю
    // (готовий лист без номера) і сповіщення студії через lib/mailer.ts.

    return NextResponse.json({ success: true, cash: true, price, mkLabel, peopleCount })
  }

  // ── Тест-режим (тільки localhost) ──────────────────────────────────────────
  if (skipPayment && process.env.NODE_ENV === 'development') {
    try {
      const clientFullName = await findOrCreateClient(name, surname, phone, instagram, spreadsheetId, email)
      await createCertificateRecord({
        buyerName: clientFullName,
        buyerPhone: phone,
        buyerInstagram: instagram,
        peopleCount,
        mkType: isGroup ? MK_TYPE_GROUP : MK_TYPE_INDIVIDUAL,
        price,
        certCode,
      }, spreadsheetId)
      console.log(`[buy-certificate] ✅ TEST сертифікат створено: ${certCode}`)

      // Паперовий — сповіщення; Електронний — картинка вкладенням.
      // Покупець отримує свій лист в обох випадках.
      if (certType === 'paper') {
        sendPaperCertNotification({
          certCode, mkType: mkLabel, peopleCount, price,
          buyerName: clientFullName, buyerPhone: phone, buyerInstagram: instagram,
          studioName: studio.name,
        }).catch((e) => console.warn('[buy-certificate] email не надіслано:', e))

        await safeSend('паперовий сертифікат покупцю', () => sendCertificateToBuyer({
          studioId, to: email, certCode, mkTypeLabel: mkLabel, isGroup,
          peopleCount, price, expiresAt: certExpiry(),
        }))
      } else {
        const imageBuffer = await renderCertificateImage({
          certCode, peopleCount, isGroup,
          expiresAt: certExpiry(),
          instagram: studio.instagramHandle,
        })
        sendDigitalCertEmail({
          certCode, mkType: mkLabel, peopleCount, price,
          buyerName: clientFullName, buyerPhone: phone, buyerInstagram: instagram,
          studioName: studio.name, city: studio.city, imageBuffer,
        }).catch((e) => console.warn('[buy-certificate] email не надіслано:', e))

        await safeSend('електронний сертифікат покупцю', () => sendCertificateToBuyer({
          studioId, to: email, certCode, mkTypeLabel: mkLabel, isGroup,
          peopleCount, price, expiresAt: certExpiry(), imageBuffer,
        }))
      }
    } catch (err) {
      console.error('[buy-certificate] ❌ TEST save:', err)
      return NextResponse.json({ error: 'Помилка збереження. Спробуйте ще раз.' }, { status: 500 })
    }
    return NextResponse.json({ success: true, certCode, certType, mkLabel, peopleCount })
  }

  // Контакт зберігаємо до оплати — email не влазить у номер замовлення WayForPay
  try {
    await findOrCreateClient(name, surname, phone, instagram, spreadsheetId, email)
  } catch (err) {
    console.warn('[buy-certificate] не вдалось зберегти контакт:', err)
  }

  const orderReference = encodeOrderData({
    n: name, s: surname, p: phone, i: instagram,
    c: peopleCount,
    d: new Date().toISOString().slice(0, 10),
    studio: studioId,
    tp: isGroup ? 'cpg' : 'cp',
    amt: price,
    cc: certCode,
    ct: certType === 'paper' ? 'p' : 'd',
  })

  try {
    const returnUrl = `${baseUrl}/api/payment/return?studio=${studioId}&certCode=${encodeURIComponent(certCode)}&certType=${certType}&mk=${encodeURIComponent(mkLabel)}&count=${peopleCount}`
    const description = `Сертифікат · ${mkLabel} · ${peopleCount} учасн.`
    const { invoiceUrl } = await createInvoice({
      orderReference,
      description,
      amount: price,
      returnUrl,
    })
    return NextResponse.json({ paymentUrl: invoiceUrl })
  } catch (err) {
    console.error('[buy-certificate] ❌ WayForPay:', err)
    return NextResponse.json(
      { error: 'Не вдалось створити посилання на оплату. Спробуйте ще раз.' },
      { status: 500 }
    )
  }
}
