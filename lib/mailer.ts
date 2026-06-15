import nodemailer from 'nodemailer'

function getTransport() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('GMAIL_USER або GMAIL_APP_PASSWORD не налаштовано')
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

export interface PaperCertNotification {
  certCode: string
  mkType: string
  peopleCount: number
  buyerName: string
  buyerPhone: string
  buyerInstagram: string
  price: number
  studioName: string
}

export async function sendPaperCertNotification(data: PaperCertNotification): Promise<void> {
  const to = process.env.GMAIL_USER!  // надсилаємо на ту саму адресу

  const subject = `🎁 Новий паперовий сертифікат — ${data.studioName}`

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #9b6b3a;">🎁 Новий паперовий сертифікат</h2>
      <p style="color: #666;">Студія: <strong>${data.studioName}</strong></p>

      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
        <tr style="background:#fdf7f2;">
          <td style="padding:8px 12px; font-weight:600; color:#2d1f0f; width:45%;">Код сертифіката</td>
          <td style="padding:8px 12px; color:#9b6b3a; font-weight:700; font-size:18px;">${data.certCode}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px; font-weight:600; color:#2d1f0f;">Формат МК</td>
          <td style="padding:8px 12px;">${data.mkType}</td>
        </tr>
        <tr style="background:#fdf7f2;">
          <td style="padding:8px 12px; font-weight:600; color:#2d1f0f;">Кількість учасників</td>
          <td style="padding:8px 12px;">${data.peopleCount}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px; font-weight:600; color:#2d1f0f;">Сума</td>
          <td style="padding:8px 12px;">${data.price.toLocaleString('uk-UA')} грн</td>
        </tr>
        <tr style="background:#fdf7f2;">
          <td style="padding:8px 12px; font-weight:600; color:#2d1f0f;">Покупець</td>
          <td style="padding:8px 12px;">${data.buyerName}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px; font-weight:600; color:#2d1f0f;">Телефон</td>
          <td style="padding:8px 12px;">${data.buyerPhone}</td>
        </tr>
        <tr style="background:#fdf7f2;">
          <td style="padding:8px 12px; font-weight:600; color:#2d1f0f;">Instagram</td>
          <td style="padding:8px 12px;">${data.buyerInstagram || '—'}</td>
        </tr>
      </table>

      <p style="margin-top:20px; color:#7a6050; font-size:14px;">
        Не забудьте підготувати паперовий сертифікат і зв'язатися з покупцем для уточнення часу отримання.
      </p>
    </div>
  `

  const transport = getTransport()
  await transport.sendMail({
    from: `"Осоння Бронювання" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  })

  console.log(`[mailer] ✅ Email надіслано на ${to}: ${subject}`)
}

// ─── Електронний сертифікат (з картинкою-вкладенням) ──────────────────────────

export interface DigitalCertEmail {
  certCode: string
  mkType: string         // людиночитна назва формату
  peopleCount: number
  buyerName: string
  buyerPhone: string
  buyerInstagram: string
  price: number
  studioName: string
  city: string           // 'Суми' / 'Івано-Франківськ' — для теми та сортування
  imageBuffer: Buffer    // PNG сертифіката
}

export async function sendDigitalCertEmail(data: DigitalCertEmail): Promise<void> {
  const to = process.env.GMAIL_USER!
  const subject = `🎁 Електронний сертифікат №${data.certCode} — ${data.city}`

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #9b6b3a;">🎁 Новий електронний сертифікат</h2>
      <p style="color: #666;">Студія: <strong>${data.studioName}</strong></p>
      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
        <tr style="background:#fdf7f2;"><td style="padding:8px 12px; font-weight:600; width:45%;">Номер</td><td style="padding:8px 12px; color:#9b6b3a; font-weight:700; font-size:18px;">${data.certCode}</td></tr>
        <tr><td style="padding:8px 12px; font-weight:600;">Формат МК</td><td style="padding:8px 12px;">${data.mkType}</td></tr>
        <tr style="background:#fdf7f2;"><td style="padding:8px 12px; font-weight:600;">Кількість учасників</td><td style="padding:8px 12px;">${data.peopleCount}</td></tr>
        <tr><td style="padding:8px 12px; font-weight:600;">Сума</td><td style="padding:8px 12px;">${data.price.toLocaleString('uk-UA')} грн</td></tr>
        <tr style="background:#fdf7f2;"><td style="padding:8px 12px; font-weight:600;">Покупець</td><td style="padding:8px 12px;">${data.buyerName}</td></tr>
        <tr><td style="padding:8px 12px; font-weight:600;">Телефон</td><td style="padding:8px 12px;">${data.buyerPhone}</td></tr>
        <tr style="background:#fdf7f2;"><td style="padding:8px 12px; font-weight:600;">Instagram</td><td style="padding:8px 12px;">${data.buyerInstagram || '—'}</td></tr>
      </table>
      <p style="margin-top:20px; color:#7a6050; font-size:14px;">
        Готовий сертифікат у вкладенні (PNG). Можна одразу надіслати клієнту.
      </p>
    </div>
  `

  const transport = getTransport()
  await transport.sendMail({
    from: `"Осоння Бронювання" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: [{
      filename: `Сертифікат-${data.certCode}.png`,
      content: data.imageBuffer,
      contentType: 'image/png',
    }],
  })

  console.log(`[mailer] ✅ Електронний сертифікат надіслано: ${subject}`)
}
