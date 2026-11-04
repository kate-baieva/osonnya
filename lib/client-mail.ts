import { getTransport } from './mailer'
import { getStudio, type StudioInfo } from './studios'
import { parseDatetime } from './schedule'

// Листи учасникам. Окремо від `mailer.ts`: там службові сповіщення студії,
// тут те, що бачить клієнт, — і правила в них різні. Службовий лист може
// виглядати як завгодно, клієнтський проходить через Gmail і Outlook.
//
// Звідси — обмеження, які виглядають старомодно, але потрібні:
//   • верстка таблицями й інлайнові стилі: Outlook ігнорує <style> у <head>
//   • шрифти лише системні: сторонні в пошті не вантажаться
//   • лого в PNG: SVG не показує жоден поширений клієнт
//
// Жоден лист не має права зламати те, через що він надсилається. Запис
// важливіший за лист про запис, тож усі виклики звідси — через `safeSend`.

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://booking.osonnya.shop'
const LOGO_URL = `${BASE_URL}/logo-mail.png`

// Відповіді клієнтів мають іти туди, де їх читають. Поки змінної немає —
// на ту саму адресу, з якої надсилаємо.
function replyTo(): string {
  return process.env.MAIL_REPLY_TO || process.env.GMAIL_USER || ''
}

// ─── Дрібні помічники ────────────────────────────────────────────────────────

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export function money(value: number): string {
  return `${value.toLocaleString('uk-UA')} грн`
}

/** «2026-11-14» → «14 листопада 2026» */
export function dateLong(date: Date): string {
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * «11/14/2026 15:00» з таблиці → дата й час для листа.
 * Дата збирається локально, а не через `new Date(рядок)`: інакше рядок без
 * зони читається як UTC, і о 00:00 МК з'їжджає на день назад.
 */
export function parseMkDatetime(raw: string): { date: Date; time: string } | null {
  const parsed = parseDatetime(raw)
  if (!parsed) return null
  const [year, month, day] = parsed.date.split('-').map(Number)
  return { date: new Date(year, month - 1, day), time: parsed.time }
}

/** «14 листопада» — без року: у темі листа він зайвий */
export function dayMonth(date: Date): string {
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
}

/** «14 листопада, субота, 15:00» — як у прототипі листа */
export function dateTimeLong(date: Date, time: string): string {
  const day = dayMonth(date)
  const weekday = date.toLocaleDateString('uk-UA', { weekday: 'long' })
  return `${day}, ${weekday}, ${time}`
}

// ─── Макет ───────────────────────────────────────────────────────────────────

const COLORS = {
  glaze: '#9b6b3a',
  clay: '#fdf7f2',
  bark: '#2d1f0f',
  muted: '#7a6050',
  rule: '#e2ddd4',
}

export interface Fact {
  label: string
  value: string
  note?: string   // сірий підпис під значенням
  big?: boolean   // виділити — так показуємо головне число листа
}

/** Табличка «деталей». Заливка через рядок, як у вже наявних наших листах. */
function factsTable(facts: Fact[], startOdd = true): string {
  const rows = facts.map((fact, i) => {
    const striped = startOdd ? i % 2 === 0 : i % 2 === 1
    const bg = striped ? `background:${COLORS.clay};` : ''
    const valueStyle = fact.big
      ? `color:${COLORS.glaze}; font-weight:700; font-size:17px;`
      : ''
    const note = fact.note
      ? `<br><span style="color:${COLORS.muted}; font-size:13px;">${fact.note}</span>`
      : ''
    return `<tr>
      <td style="${bg} padding:9px 12px; font-weight:600; color:${COLORS.bark}; width:42%; vertical-align:top;">${fact.label}</td>
      <td style="${bg} padding:9px 12px; color:${COLORS.bark}; vertical-align:top; ${valueStyle}">${fact.value}${note}</td>
    </tr>`
  }).join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
    style="width:100%; border-collapse:collapse; font-size:14.5px; margin:15px 0 0;">${rows}</table>`
}

/** Виділений блок із заголовком — «Що взяти з собою» і подібні. */
function noteBlock(title: string, body: string): string {
  return `<div style="background:${COLORS.clay}; border-left:3px solid ${COLORS.glaze};
    padding:13px 15px; margin:15px 0 0; font-size:14px; color:${COLORS.bark};">
    <strong style="display:block; margin-bottom:3px;">${title}</strong>${body}</div>`
}

function button(href: string, label: string): string {
  return `<div style="margin:15px 0 0;"><a href="${href}"
    style="display:inline-block; background:${COLORS.glaze}; color:#ffffff;
    padding:11px 20px; border-radius:9px; text-decoration:none;
    font-weight:600; font-size:14.5px;">${label}</a></div>`
}

function paragraph(html: string): string {
  return `<p style="margin:15px 0 0;">${html}</p>`
}

function igLink(studio: StudioInfo): string {
  const url = studio.id === 'if'
    ? 'https://www.instagram.com/osonnya.ceramics.if/'
    : 'https://www.instagram.com/osonnya.ceramics/'
  return `<a href="${url}" style="color:${COLORS.glaze};">${studio.instagramHandle}</a>`
}

interface LayoutOptions {
  studio: StudioInfo
  heading: string
  content: string
  /** Посилання в підвалі, крім адреси й Instagram */
  legal?: { label: string; path: string }[]
}

function layout({ studio, heading, content, legal = [] }: LayoutOptions): string {
  const legalHtml = legal
    .map((item) => `<a href="${BASE_URL}${item.path}" style="color:${COLORS.muted};">${item.label}</a>`)
    .join(' · ')

  return `<div style="background:#f4f1ec; padding:24px 0; font-family:${FONT};">
  <div style="max-width:560px; margin:0 auto; background:#ffffff; padding:30px 26px 34px;
    color:${COLORS.bark}; font-size:15px; line-height:1.62;">

    <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid ${COLORS.rule};">
      <img src="${LOGO_URL}" width="150" alt="Осоння"
        style="width:150px; max-width:150px; height:auto; display:inline-block; border:0;">
    </div>

    <h1 style="font-size:21px; font-weight:700; line-height:1.3;
      color:${COLORS.bark}; margin:22px 0 0;">${heading}</h1>

    ${content}

    <div style="margin-top:26px; padding-top:18px; border-top:1px solid ${COLORS.rule};
      font-size:12.5px; line-height:1.65; color:${COLORS.muted};">
      ${legalHtml ? legalHtml + '<br>' : ''}
      ${studio.name}, ${studio.address} · ${igLink(studio)}
    </div>
  </div>
</div>`
}

// ─── Надсилання ──────────────────────────────────────────────────────────────

interface SendOptions {
  to: string
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer; contentType: string }[]
}

async function send({ to, subject, html, attachments }: SendOptions): Promise<void> {
  const transport = getTransport()
  await transport.sendMail({
    from: `"Осоння" <${process.env.GMAIL_USER}>`,
    replyTo: replyTo() || undefined,
    to,
    subject,
    html,
    ...(attachments ? { attachments } : {}),
  })
  console.log(`[client-mail] ✅ ${subject} → ${to}`)
}

/**
 * Лист ніколи не має ламати те, заради чого його шлють: запис уже збережено,
 * оплата пройшла. Тому всі помилки гасяться тут, у лог.
 */
export async function safeSend(what: string, task: () => Promise<void>): Promise<void> {
  try {
    await task()
  } catch (error) {
    console.error(`[client-mail] ❌ ${what} не надіслано:`, (error as Error).message)
  }
}

// ─── 1. Підтвердження запису ────────────────────────────────────────────────

export interface BookingConfirmation {
  studioId: string
  to: string
  mkDate: Date
  mkTime: string
  peopleCount: number
  paid: number
  /** Лишилось доплатити в студії. Індивідуальний МК бере лише передоплату. */
  due?: number
  certificateCode?: string
  promoCode?: string
  promoPercent?: number
}

export async function sendBookingConfirmation(data: BookingConfirmation): Promise<void> {
  const studio = getStudio(data.studioId)
  if (!studio || !data.to) return

  const facts: Fact[] = [
    { label: 'Коли', value: dateTimeLong(data.mkDate, data.mkTime), big: true },
    { label: 'Де', value: `${studio.name},<br>${studio.address}` },
    { label: 'Учасників', value: String(data.peopleCount) },
  ]

  // Гроші йдуть окремим блоком: рядки залежать від того, як платили
  const payment: Fact[] = []
  if (data.certificateCode) {
    payment.push({ label: 'Сертифікат', value: `№ ${data.certificateCode}`, note: 'зараховано' })
  }
  if (data.promoCode) {
    payment.push({
      label: 'Промокод',
      value: data.promoCode,
      note: data.promoPercent ? `знижка ${data.promoPercent}%` : undefined,
    })
  }
  payment.push({
    label: 'Сплачено',
    value: money(data.paid),
    note: data.due && data.due > 0 ? '(передоплата)' : undefined,
  })
  if (data.due && data.due > 0) {
    payment.push({ label: 'Лишається доплатити', value: money(data.due), big: true })
  }

  const content = [
    paragraph('Дякуємо за запис на майстер-клас з ліплення з глини. Нижче лишаємо '
      + 'вам усю необхідну інформацію, яку потрібно знати перед початком.'),
    factsTable(facts),
    factsTable(payment, false),
    button(studio.instagramHighlightsUrl, 'Локація'),
    `<p style="margin:15px 0 0; font-size:13.5px; color:${COLORS.muted};">
      У збережених історіях «Локація» на нашій сторінці в Instagram показано,
      як дійти до входу — його не одразу видно.</p>`,
    noteBlock('Що взяти з собою',
      'Нічого не потрібно. Ми надаємо глину, інструменти та фартухи — все, '
      + 'що необхідно для роботи. Будь ласка, підготуйте ідеї виробів, що б ви '
      + 'хотіли зліпити в студії. Якщо нічого не приходить на думку — не біда, '
      + 'майстриня підкаже вам на місці.'),
    noteBlock('Коли будуть готові вироби',
      'Після майстер-класу вироби лишаються в студії й проходять чотири етапи: '
      + 'сушка, перший випал, глазурування та другий випал. Цей процес займає '
      + '3–4 тижні. Ми повідомимо вас, коли ваші вироби будуть готові.'),
    paragraph('<strong>Потрібно перенести або скасувати?</strong> Напишіть про зміну '
      + `планів у відповідь на цей лист, або в Instagram ${igLink(studio)}.`),
    paragraph('При попередженні більше, ніж за добу до майстер-класу — ми повернемо '
      + 'вам передоплату.'),
    `<p style="margin:15px 0 0;">До зустрічі,<br>команда Осоння</p>`,
  ].join('')

  await send({
    to: data.to,
    subject: `Ви записані на майстер-клас ${dayMonth(data.mkDate)}, ${data.mkTime} — ${studio.name}`,
    html: layout({
      studio,
      heading: 'Ви записані. Чекаємо вас!',
      content,
      legal: [
        { label: 'Правила роботи студій під час повітряних тривог', path: '/air-raid-rules' },
        { label: 'Публічний договір', path: '/public-contract' },
      ],
    }),
  })
}

// ─── 2–3. Сертифікат ────────────────────────────────────────────────────────

export interface CertificateEmail {
  studioId: string
  to: string
  certCode: string
  /** Людиночитна назва формату: «Груповий МК», «Парний МК» */
  mkTypeLabel: string
  peopleCount: number
  price: number
  expiresAt: Date
  /** PNG сертифіката. Є лише в електронного — паперовий забирають у студії. */
  imageBuffer?: Buffer
}

export async function sendCertificateToBuyer(data: CertificateEmail): Promise<void> {
  const studio = getStudio(data.studioId)
  if (!studio || !data.to) return

  const isDigital = Boolean(data.imageBuffer)

  const facts: Fact[] = [
    { label: 'Номер сертифіката', value: data.certCode, big: true },
    { label: 'Формат', value: data.mkTypeLabel },
    { label: 'Учасників', value: String(data.peopleCount) },
    { label: 'Діє до', value: dateLong(data.expiresAt), note: '3 місяці' },
    { label: 'Сума', value: money(data.price) },
  ]

  const intro = isDigital
    ? paragraph('Дякуємо за покупку! Ваш сертифікат знаходиться у вкладенні до цього '
      + 'листа. Сертифікат можна надіслати у подарунок в електронному вигляді, '
      + 'або роздрукувати.')
    : [
      paragraph('Дякуємо за покупку! Ми підготуємо паперовий сертифікат, і його '
        + 'можна буде забрати в студії.'),
      paragraph('<strong>Номером можна скористатися вже зараз</strong> — забронювати '
        + 'місце на майстер-класі, а сам сертифікат забрати пізніше, коли буде зручно.'),
    ].join('')

  // У паперового — ще й графік, коли його забрати
  const pickup = isDigital ? '' : [
    factsTable([
      { label: 'Де забрати', value: studio.address },
      { label: 'Коли', value: 'Пт–Нд, 12:00–14:00 та 16:00–18:00' },
    ], false),
    noteBlock('Не підходить цей графік?',
      `Напишіть нам в Instagram ${igLink(studio)} — ми знайдемо спосіб передати `
      + 'вам сертифікат в інший день та час.'),
  ].join('')

  const content = [
    intro,
    factsTable(facts),
    pickup,
    noteBlock('Як ним скористатись',
      'На сайті вибрати зручний час і ввести номер сертифіката замість оплати. '
      + 'Записується той, хто піде на майстер-клас — не обов\'язково ви.'),
    button(`${BASE_URL}${studio.basePath}`, 'Вибрати час майстер-класу →'),
    paragraph('Якщо термін добігає кінця, а нагоди завітати до Осоння так і не '
      + 'випало — напишіть нам у відповідь на цей лист, або в Instagram '
      + `${igLink(studio)} — ми щось придумаємо.`),
    `<p style="margin:15px 0 0;">Гарного подарунка,<br>команда Осоння</p>`,
  ].join('')

  await send({
    to: data.to,
    subject: isDigital
      ? `Ваш сертифікат №${data.certCode} — ${studio.name}`
      : `Ваш сертифікат №${data.certCode} чекає на вас у студії — ${studio.name}`,
    html: layout({
      studio,
      heading: isDigital
        ? 'Сертифікат готовий — він у вкладенні'
        : 'Сертифікат готовий — чекає на вас у студії',
      content,
      legal: [{ label: 'Публічний договір', path: '/public-contract' }],
    }),
    ...(data.imageBuffer ? {
      attachments: [{
        filename: `Сертифікат-${data.certCode}.png`,
        content: data.imageBuffer,
        contentType: 'image/png',
      }],
    } : {}),
  })
}

// ─── 4. Нагадування напередодні ─────────────────────────────────────────────

export interface ReminderEmail {
  studioId: string
  to: string
  mkDate: Date
  mkTime: string
  peopleCount: number
  /** Скільки вже сплачено. Без передоплати — 0, і так і пишемо. */
  paid?: number
  due?: number
}

export async function sendReminder(data: ReminderEmail): Promise<void> {
  const studio = getStudio(data.studioId)
  if (!studio || !data.to) return

  const day = dayMonth(data.mkDate)

  const facts: Fact[] = [
    { label: 'Коли', value: `Завтра, ${day}, ${data.mkTime}`, big: true },
    { label: 'Де', value: `${studio.address}, ${studio.city}` },
    { label: 'Учасників', value: String(data.peopleCount) },
  ]

  // Є борг — показуємо обидва рядки. «Сплачено 0 грн» виглядає різкувато,
  // але це чесно: людина має побачити, що в студії платитиме всю суму.
  const due = data.due && data.due > 0
    ? factsTable([
      { label: 'Сплачено', value: money(data.paid ?? 0) },
      { label: 'Лишається доплатити', value: money(data.due), big: true },
      { label: '', value: `<span style="color:${COLORS.muted};">Оплатити можна в студії перед заняттям</span>` },
    ], false)
    : ''

  const content = [
    paragraph('Нагадуємо про ваш майстер-клас — він відбудеться вже завтра.'),
    factsTable(facts),
    due,
    paragraph('Приходьте, будь ласка, за 5 хвилин до початку, щоб підготуватися '
      + 'та визначитися з виробом, який будете ліпити.'),
    button(studio.instagramHighlightsUrl, 'Локація'),
    noteBlock('Не виходить прийти?',
      `Відповідайте на цей лист або напишіть у Instagram ${igLink(studio)} — `
      + 'перенесемо запис на інший день. Чим раніше скажете, тим легше знайти '
      + 'вам гарний час.'),
    `<p style="margin:15px 0 0;">До зустрічі,<br>команда Осоння</p>`,
  ].join('')

  await send({
    to: data.to,
    subject: `Нагадуємо: майстер-клас завтра о ${data.mkTime} — ${studio.name}`,
    html: layout({
      studio,
      heading: 'Завтра зустрічаємось',
      content,
      legal: [{ label: 'Правила роботи студій під час повітряних тривог', path: '/air-raid-rules' }],
    }),
  })
}

// ─── 5. Вироби готові ───────────────────────────────────────────────────────

export interface PiecesReadyEmail {
  studioId: string
  to: string
  /** Дата майстер-класу — людина впізнає свої вироби саме по ній */
  mkDate: Date | null
  numbers: string[]
}

/** Скільки зберігаємо вироби — рахується від дня цього листа, не від МК. */
const STORAGE_MONTHS = 6

export async function sendPiecesReady(data: PiecesReadyEmail): Promise<void> {
  const studio = getStudio(data.studioId)
  if (!studio || !data.to || data.numbers.length === 0) return

  const storedTill = new Date()
  storedTill.setMonth(storedTill.getMonth() + STORAGE_MONTHS)

  const fromMk = data.mkDate
    ? ` з майстер-класу <strong>${dayMonth(data.mkDate)}</strong>`
    : ''

  const numbers = data.numbers
    .map((number) => `<span style="display:inline-block; font-weight:600; color:${COLORS.glaze};
      background:${COLORS.clay}; border:1px solid ${COLORS.rule}; border-radius:3px;
      padding:5px 11px; margin:0 6px 6px 0;">№ ${number}</span>`)
    .join('')

  const content = [
    paragraph(`Вироби${fromMk} випалені й заглазуровані. Можна забирати:`),
    `<div style="margin:15px 0 0;">${numbers}</div>`,
    factsTable([
      { label: 'Де забрати', value: `${studio.name},<br>${studio.address}` },
      { label: 'Коли', value: 'Пт–Нд, 12:00–18:00', note: '14:00–16:00 — обідня перерва' },
      { label: 'Зберігаємо до', value: dateLong(storedTill), note: `${STORAGE_MONTHS} місяців від сьогодні` },
    ]),
    noteBlock('Прийде хтось інший?',
      'Не проблема — просто назвіть номери виробів із цього листа.'),
    paragraph(`Якщо не встигаєте забрати вироби протягом ${STORAGE_MONTHS} місяців, `
      + 'або вам не підходить наш графік роботи — напишіть нам, ми знайдемо інший '
      + 'спосіб передати вам вироби.'),
    `<p style="margin:15px 0 0;">До зустрічі,<br>команда Осоння</p>`,
  ].join('')

  await send({
    to: data.to,
    subject: 'Ваші вироби готові — можна забирати',
    html: layout({
      studio,
      heading: 'Ваші вироби готові',
      content,
    }),
  })
}
