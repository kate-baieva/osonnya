import { google } from 'googleapis'
import crypto from 'crypto'
import { config } from './config'
import type { Slot } from '@/types'

function getAuth() {
  const raw = process.env.GOOGLE_CREDENTIALS ?? ''
  if (!raw) throw new Error('GOOGLE_CREDENTIALS is not set')
  const credentials = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

export { getSheets as getSheetsClient }

// Повертає числовий sheetId (gid) для аркуша за назвою
async function getSheetIdByName(sheetName: string, spreadsheetId: string): Promise<number | null> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  })
  const sheet = res.data.sheets?.find((s) => s.properties?.title === sheetName)
  return sheet?.properties?.sheetId ?? null
}

// Копіює data validation (спадні меню) з одного рядка в інший
async function copyRowDataValidation(
  fromRow: number,  // 1-indexed
  toRow: number,    // 1-indexed
  sheetId: number,
  spreadsheetId: string,
): Promise<void> {
  const sheets = getSheets()
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        copyPaste: {
          source: {
            sheetId,
            startRowIndex: fromRow - 1,
            endRowIndex: fromRow,
            startColumnIndex: 0,
            endColumnIndex: 20,
          },
          destination: {
            sheetId,
            startRowIndex: toRow - 1,
            endRowIndex: toRow,
            startColumnIndex: 0,
            endColumnIndex: 20,
          },
          pasteType: 'PASTE_DATA_VALIDATION',
        },
      }],
    },
  })
}

// Перемикає чекбокс M1 в аркуші MK Orders (FALSE → TRUE),
// щоб тригернути синхронізацію з Google Calendar
async function triggerCalendarSync(spreadsheetId: string): Promise<void> {
  const sheets = getSheets()
  const range = `${config.sheets.orders}!M1`
  // Спочатку FALSE, потім TRUE — гарантує зміну значення і тригер onChange
  await sheets.spreadsheets.values.update({
    spreadsheetId, range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[false]] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId, range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[true]] },
  })
}

// Підтримує формати:
//   "2/15/2025 15:30:00"  (Google Sheets M/D/YYYY)
//   "2025-02-15 15:30:00" (ISO-like)
function parseDatetime(raw: string): { date: string; time: string } | null {
  if (!raw) return null
  const str = raw.trim()

  // M/D/YYYY H:MM:SS  або  M/D/YYYY H:MM
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (mdy) {
    const [, month, day, year, hour, minute] = mdy
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    const time  = `${hour.padStart(2, '0')}:${minute}`
    return { date, time }
  }

  // YYYY-MM-DD HH:MM:SS  або ISO
  const normalized = str.replace(' ', 'T')
  const dt = new Date(normalized)
  if (isNaN(dt.getTime())) return null
  return { date: normalized.slice(0, 10), time: normalized.slice(11, 16) }
}

function rowToSlot(row: string[], rowIndex: number): Slot | null {
  const datetimeRaw   = (row[0] ?? '').trim()   // A: Date (datetime)
  const capacity      = Number(row[1] ?? 0)      // B: Capacity
  const registeredRaw = (row[2] ?? '').trim()    // C: # of sign ups [auto]
  const eventId       = (row[3] ?? '').trim()    // D: EventId
  const title         = (row[4] ?? '').trim()    // E: Name

  const parsed = parseDatetime(datetimeRaw)
  if (!parsed) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (new Date(parsed.date) < today) return null

  const registered    = /^\d+$/.test(registeredRaw) ? Number(registeredRaw) : 0
  const spotsRemaining = capacity - registered
  if (spotsRemaining <= 0) return null

  return {
    id: eventId || `row_${rowIndex}`,
    datetime: datetimeRaw,
    date: parsed.date,
    time: parsed.time,
    title,
    capacity,
    registered,
    spotsRemaining,
  }
}

// ─── Slots ───────────────────────────────────────────────────────────────────

export async function getSlots(spreadsheetId?: string): Promise<Slot[]> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const startRow = config.dataRows.slots
  const range = `${config.sheets.slots}!A${startRow}:E`

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range })
  const rows = (res.data.values ?? []) as string[][]
  return rows
    .map((row, i) => rowToSlot(row, startRow + i))
    .filter((s): s is Slot => s !== null)
}

export async function getSlotById(slotId: string, spreadsheetId?: string): Promise<Slot | null> {
  const slots = await getSlots(spreadsheetId)
  return slots.find((s) => s.id === slotId) ?? null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Формат MM/DD/YY HH:MM:SS (як в існуючих записах таблиці)
function formatDateSheet(d: Date): string {
  const mm  = String(d.getMonth() + 1).padStart(2, '0')
  const dd  = String(d.getDate()).padStart(2, '0')
  const yy  = String(d.getFullYear()).slice(2)
  const hh  = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss  = String(d.getSeconds()).padStart(2, '0')
  return `${mm}/${dd}/${yy} ${hh}:${min}:${ss}`
}

// Знаходить перший порожній рядок після останнього запису
async function findNextRow(sheetName: string, startRow: number, spreadsheetId?: string): Promise<number> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${sheetName}!A${startRow}:A`,
  })
  const rows = (res.data.values ?? []) as string[][]
  let lastFilled = startRow - 1
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i]?.[0] ?? '').trim() !== '') {
      lastFilled = startRow + i
    }
  }
  return lastFilled + 1
}

// ─── Clients ─────────────────────────────────────────────────────────────────

// Нормалізація для порівняння клієнтів
function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
// Телефон → лише останні 9 цифр (щоб 0XX, +380XX, 380XX збігалися)
function normPhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  return digits.slice(-9)
}

// Шукає клієнта за повним збігом імені + прізвища + телефону.
// Якщо знайдено — повертає наявне повне ім'я (новий запис не додається).
// Інакше — додає новий запис. Повертає повне ім'я.
export async function findOrCreateClient(
  name: string,
  surname: string,
  phone: string,
  instagram?: string,
  spreadsheetId?: string,
  email?: string,
  newsletter?: boolean,
): Promise<string> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const startRow = config.dataRows.clients
  // F = Email, G = Розсилка (E = Full Name [auto] — не чіпаємо)
  const newsVal = newsletter ? 'так' : ''

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${config.sheets.clients}!A${startRow}:D`,
  })

  const wantName    = normName(name)
  const wantSurname = normName(surname)
  const wantPhone   = normPhone(phone)

  const rows = (res.data.values ?? []) as string[][]
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const existingName    = normName(row[0] ?? '')
    const existingSurname = normName(row[1] ?? '')
    const existingPhone   = normPhone(row[2] ?? '')

    // Повний збіг усіх трьох полів — використовуємо наявний запис
    if (existingName === wantName && existingSurname === wantSurname && existingPhone === wantPhone) {
      // Оновлюємо email / розсилку, якщо email передано
      if (email) {
        const rowIndex = startRow + i
        await sheets.spreadsheets.values.update({
          spreadsheetId: sid,
          range: `${config.sheets.clients}!F${rowIndex}:G${rowIndex}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[email, newsVal]] },
        }).catch(() => {})
      }
      return `${(row[0] ?? '').trim()} ${(row[1] ?? '').trim()}`.trim()
    }
  }

  const nextRow = await findNextRow(config.sheets.clients, config.dataRows.clients, sid)
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.clients}!A${nextRow}:D${nextRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[name, surname, phone, instagram ?? '']] },
  })
  // Email + розсилка окремо (щоб не зачепити колонку E з автоформулою)
  if (email) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid,
      range: `${config.sheets.clients}!F${nextRow}:G${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[email, newsVal]] },
    }).catch(() => {})
  }

  return `${name} ${surname}`.trim()
}

// ─── Pending Orders (тимчасове сховище до підтвердження оплати) ───────────────
// Повні дані замовлення зберігаємо в окремому аркуші, а в orderReference кладемо
// лише короткий id. Так імена/email будь-якої довжини не ламають ліміт WayForPay.

const ensuredPendingSheets = new Set<string>()

async function ensurePendingSheet(spreadsheetId: string): Promise<void> {
  if (ensuredPendingSheets.has(spreadsheetId)) return
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))',
  })
  const exists = meta.data.sheets?.some((s) => s.properties?.title === config.sheets.pending)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: config.sheets.pending } } }] },
    })
  }
  ensuredPendingSheets.add(spreadsheetId)
}

export async function savePendingOrder(
  payload: Record<string, unknown>,
  spreadsheetId?: string,
): Promise<string> {
  const sid = spreadsheetId ?? config.spreadsheetId
  await ensurePendingSheet(sid)
  const sheets = getSheets()
  const id = crypto.randomBytes(8).toString('hex') // 16 hex символів
  const nextRow = await findNextRow(config.sheets.pending, 1, sid)
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.pending}!A${nextRow}:C${nextRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[id, JSON.stringify(payload), formatDateSheet(new Date())]] },
  })
  return id
}

export async function readPendingOrder(
  id: string,
  spreadsheetId?: string,
): Promise<Record<string, unknown> | null> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${config.sheets.pending}!A1:B`,
  })
  const rows = (res.data.values ?? []) as string[][]
  for (const r of rows) {
    if ((r[0] ?? '').trim() === id) {
      try { return JSON.parse(r[1] ?? '{}') } catch { return null }
    }
  }
  return null
}

// ─── Orders ──────────────────────────────────────────────────────────────────

// Повертає номер рядка, щоб вебхук міг оновити передоплату
export async function appendOrder(
  data: {
    clientFullName: string
    mkDatetime: string
    peopleCount: number
    orderReference: string
    status?: string          // 'booked' (default) | 'certificate'
    certificateCode?: string
    pricePerPerson?: number  // 650 для Сум, 700 для ІФ (для групового МК)
    totalAmount?: number     // явна сума (з урахуванням знижки промокоду)
    mkType?: string          // 'group' (default) | 'individual'
    promoCode?: string       // застосований промокод (колонка S)
  },
  spreadsheetId?: string,
): Promise<number> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const now = formatDateSheet(new Date())
  const nextRow = await findNextRow(config.sheets.orders, config.dataRows.orders, sid)
  const totalAmount = data.totalAmount ?? data.peopleCount * (data.pricePerPerson ?? 650)

  // Колонки A–O: Order DateTime, Client, Amount, Prepayment, Prepay Date,
  // Prepay Account, Type, MK DateTime, # of People, Afterpayment,
  // Afterpay Date, Afterpay Account, Certificate #, Status, Comment
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.orders}!A${nextRow}:O${nextRow}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        now,                              // A: Order DateTime
        data.clientFullName,              // B: Client
        totalAmount,                      // C: Amount
        '',                               // D: Prepayment
        '',                               // E: Prepay Date
        '',                               // F: Prepay Account
        data.mkType ?? 'group',           // G: Type
        data.mkDatetime,                  // H: MK DateTime
        data.peopleCount,                 // I: # of People
        '',                               // J: Afterpayment
        '',                               // K: Afterpay Date
        '',                               // L: Afterpay Account
        data.certificateCode ?? '',       // M: Certificate #
        data.status ?? 'booked',          // N: Status
        data.orderReference,              // O: Comment
      ]],
    },
  })

  // ── Промокод у колонку S (якщо застосований) ────────────────────────────
  if (data.promoCode) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid,
      range: `${config.sheets.orders}!S${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[data.promoCode]] },
    }).catch((e) => console.warn('[appendOrder] не вдалось записати промокод:', e))
  }

  // ── Копіюємо data validation (спадні меню) з рядка вище ─────────────────
  try {
    const ordersSheetId = await getSheetIdByName(config.sheets.orders, sid)
    if (ordersSheetId !== null) {
      const fromRow = nextRow - 1  // рядок вище (заголовок або попередній запис)
      await copyRowDataValidation(fromRow, nextRow, ordersSheetId, sid)
    }
  } catch (err) {
    // Не критично — логуємо але не зупиняємо виконання
    console.warn('[appendOrder] не вдалось скопіювати data validation:', err)
  }

  // ── Тригер синхронізації з Google Calendar для індивідуальних МК ─────────
  if (data.mkType === 'individual') {
    try {
      await triggerCalendarSync(sid)
    } catch (err) {
      console.warn('[appendOrder] не вдалось тригернути calendar sync:', err)
    }
  }

  return nextRow
}

// Знаходить рядок замовлення за orderReference (у колонці O — Comment)
export async function findOrderRowByReference(
  orderReference: string,
  spreadsheetId?: string,
): Promise<{ rowIndex: number; certificateCode: string } | null> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const startRow = config.dataRows.orders

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${config.sheets.orders}!M${startRow}:O`,
  })

  const rows = (res.data.values ?? []) as string[][]
  for (let i = 0; i < rows.length; i++) {
    const comment = (rows[i]?.[2] ?? '').trim()
    if (comment === orderReference) {
      return {
        rowIndex: startRow + i,
        certificateCode: (rows[i]?.[0] ?? '').trim(),
      }
    }
  }
  return null
}

// Заповнює передоплату після успішної оплати через WayForPay
export async function updateOrderPrepayment(
  rowIndex: number,
  amount: number,
  spreadsheetId?: string,
): Promise<void> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const payDate = formatDateSheet(new Date())

  // D: Prepayment, E: Prepay Date, F: Prepay Account
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.orders}!D${rowIndex}:F${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[amount, payDate, 'WayForPay']] },
  })
}

// ─── Certificates ─────────────────────────────────────────────────────────────

export interface CertificateInfo {
  rowIndex: number
  code: string
  peopleCount: number
  type: string
  expiresAt: Date
}

export async function validateCertificate(
  code: string,
  spreadsheetId?: string,
  requiredMkType?: string,   // якщо передано — тип у сертифікаті має містити це значення
): Promise<{ valid: true; info: CertificateInfo } | { valid: false; reason: string }> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const startRow = config.dataRows.certificates

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${config.sheets.certificates}!A${startRow}:J`,
  })

  const rows = (res.data.values ?? []) as string[][]
  const trimmed = code.trim()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const certCode = (row[6] ?? '').trim()  // G: номер сертифікату
    if (certCode !== trimmed) continue

    const usedRaw = (row[9] ?? '').trim()   // J: чекбокс
    if (usedRaw === 'TRUE' || usedRaw === 'true' || usedRaw === '1') {
      return { valid: false, reason: 'Цей сертифікат вже використано' }
    }

    const expiryRaw = (row[4] ?? '').trim() // E: термін дії MM/DD/YYYY
    const [month, day, year] = expiryRaw.split('/').map(Number)
    const expiresAt = new Date(year, month - 1, day, 23, 59, 59, 999)
    if (isNaN(expiresAt.getTime())) {
      return { valid: false, reason: 'Не вдалося перевірити термін дії сертифікату' }
    }
    if (expiresAt < new Date()) {
      return { valid: false, reason: 'Термін дії сертифікату закінчився' }
    }

    const peopleCount = Number(row[3] ?? 1) // D
    const type = (row[5] ?? '').trim()       // F

    // Перевіряємо тип МК (для індивідуального — має бути 'individual' або 'Індивідуальний')
    if (requiredMkType && !type.toLowerCase().includes(requiredMkType.toLowerCase())) {
      return { valid: false, reason: 'Цей сертифікат не підходить для індивідуального майстер-класу' }
    }

    return {
      valid: true,
      info: { rowIndex: startRow + i, code: certCode, peopleCount, type, expiresAt },
    }
  }

  return { valid: false, reason: 'Сертифікат не знайдено' }
}

// ─── Individual Prices ───────────────────────────────────────────────────────

export interface IndividualPrice {
  peopleCount: number
  label: string
  priceWeekday: number
  priceWeekend: number | null  // null для студій без різниці будній/вихідний
}

// Спільна логіка читання аркуша Prices
async function parsePricesSheet(
  spreadsheetId: string,
  includeGroup: boolean,   // чи включати Груповий МК
): Promise<IndividualPrice[]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Prices!A1:D25',
  })

  const rows = (res.data.values ?? []) as string[][]
  const result: IndividualPrice[] = []

  for (const row of rows) {
    const service   = (row[0] ?? '').trim()
    const price1Str = (row[2] ?? '').trim()
    const price2Str = (row[3] ?? '').trim()

    if (!service || !price1Str) continue
    const low = service.toLowerCase()

    // Завжди пропускаємо: заголовки та Оренда
    if (low.includes('service') || low.includes('оренд')) continue
    // Груповий МК — включаємо лише якщо потрібно
    if (!includeGroup && low.includes('груповий')) continue

    // Кількість учасників — з назви (бо в Amount є друкарські помилки)
    const nameMatch = service.match(/(\d+)\s*люд/)
    let peopleCount: number | null = nameMatch ? parseInt(nameMatch[1]) : null
    if (!peopleCount) {
      if (low.includes('парний'))   peopleCount = 2
      if (low.includes('груповий')) peopleCount = 1
    }
    if (!peopleCount) continue

    const priceWeekday = parseInt(price1Str)
    const priceWeekend = price2Str && !isNaN(parseInt(price2Str)) ? parseInt(price2Str) : null
    if (isNaN(priceWeekday)) continue

    result.push({ peopleCount, label: service, priceWeekday, priceWeekend })
  }

  return result.sort((a, b) => a.peopleCount - b.peopleCount)
}

// Тільки індивідуальні МК (для сторінки індивідуального запису)
export async function getIndividualPrices(spreadsheetId?: string): Promise<IndividualPrice[]> {
  return parsePricesSheet(spreadsheetId ?? config.spreadsheetId, false)
}

// Всі типи МК — для сертифікатів
export async function getAllMkPrices(spreadsheetId?: string): Promise<IndividualPrice[]> {
  return parsePricesSheet(spreadsheetId ?? config.spreadsheetId, true)
}

// Повертає наступний числовий номер сертифіката (продовжує наявну нумерацію).
// Коди з літерами (старі WEB-...) ігноруються. Якщо числових немає — починає з 10000.
export async function getNextCertNumber(spreadsheetId?: string): Promise<string> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const startRow = config.dataRows.certificates

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${config.sheets.certificates}!G${startRow}:G`,
  })

  const rows = (res.data.values ?? []) as string[][]
  let max = 9999  // щоб перший номер був 10000
  for (const r of rows) {
    const v = (r[0] ?? '').trim()
    if (/^\d+$/.test(v)) {
      const n = parseInt(v, 10)
      if (n > max) max = n
    }
  }
  return String(max + 1)
}

// Записує новий сертифікат після успішної оплати
export async function createCertificateRecord(
  data: {
    buyerName: string
    buyerPhone: string
    buyerInstagram: string
    peopleCount: number
    mkType: string   // назва формату МК
    price: number
    certCode: string
  },
  spreadsheetId?: string,
): Promise<void> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const now = new Date()
  const orderDate = formatDateSheet(now)

  // Термін дії — 3 місяці від дати купівлі
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + 3)
  const mm   = String(expiresAt.getMonth() + 1).padStart(2, '0')
  const dd   = String(expiresAt.getDate()).padStart(2, '0')
  const yyyy = expiresAt.getFullYear()
  const expiresStr = `${mm}/${dd}/${yyyy}`

  const nextRow = await findNextRow(config.sheets.certificates, config.dataRows.certificates, sid)

  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.certificates}!A${nextRow}:J${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        orderDate,              // A: Order DateTime
        data.buyerName,         // B: Client
        data.price,             // C: Amount
        data.peopleCount,       // D: # of People
        expiresStr,             // E: Due Date (MM/DD/YYYY)
        data.mkType,            // F: MK Type
        data.certCode,          // G: Number
        orderDate,              // H: Payment Date
        'WayForPay',            // I: Payment Account
        false,                  // J: Utilized? = FALSE
      ]],
    },
  })
}

export async function redeemCertificate(rowIndex: number, spreadsheetId?: string): Promise<void> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.certificates}!J${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['TRUE']] },
  })
}

// ─── Promo codes ──────────────────────────────────────────────────────────────
// Аркуш «Promo codes»: A=Дата створення, B=Контакт, C=Знижка %, D=Термін дії[авто],
// E=Тип МК, F=Промокод, G=Використаний, H=Завершився термін[авто].

// Генерує складний для вгадування код: OS-XXXXXXXX (8 символів без неоднозначних)
export function generatePromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'OS-'
  for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)]
  return code
}

// Записує новий промокод. Дати/термін/статуси рахуються формулами — не чіпаємо D,G,H.
export async function createPromoRecord(
  data: { contact: string; discountPercent: number; mkType: string; code: string },
  spreadsheetId?: string,
): Promise<void> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const now = formatDateSheet(new Date())
  const nextRow = await findNextRow(config.sheets.promo, config.dataRows.promo, sid)
  // A,B,C (пропускаємо D — автоформула)
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.promo}!A${nextRow}:C${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[now, data.contact, data.discountPercent]] },
  })
  // E,F (пропускаємо H — автоформула)
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.promo}!E${nextRow}:F${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[data.mkType, data.code]] },
  })
  // G = чекбокс «Використаний» = FALSE (не використаний). Ставимо перевірку даних
  // на цей рядок, щоб показувався чекбокс (у таблиці ІФ колонка вже типізована — ігноруємо помилку).
  try {
    const promoSheetId = await getSheetIdByName(config.sheets.promo, sid)
    if (promoSheetId !== null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: { requests: [{
          setDataValidation: {
            range: { sheetId: promoSheetId, startRowIndex: nextRow - 1, endRowIndex: nextRow, startColumnIndex: 6, endColumnIndex: 7 },
            rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true },
          },
        }] },
      })
    }
  } catch { /* ІФ — типізована колонка таблиці, чекбокс уже є */ }
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.promo}!G${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[false]] },
  }).catch(() => {})
}

export interface PromoInfo {
  rowIndex: number
  discountPercent: number
  mkType: string
}

function serialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
}

export async function validatePromo(
  code: string,
  spreadsheetId?: string,
  requiredMkType?: string,
): Promise<{ valid: true; info: PromoInfo } | { valid: false; reason: string }> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const startRow = config.dataRows.promo

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${config.sheets.promo}!A${startRow}:H`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  })

  const rows = (res.data.values ?? []) as unknown[][]
  const trimmed = code.trim().toUpperCase()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowCode = String(row[5] ?? '').trim().toUpperCase() // F
    if (rowCode !== trimmed) continue

    // Використаний? (G)
    const used = row[6]
    if (used === true || String(used).toUpperCase() === 'TRUE') {
      return { valid: false, reason: 'Цей промокод вже використано' }
    }

    // Термін дії (D — серійна дата)
    const dueRaw = row[3]
    if (typeof dueRaw === 'number') {
      const due = serialToDate(dueRaw)
      // дійсний до кінця дня
      due.setUTCHours(23, 59, 59, 999)
      if (due.getTime() < Date.now()) {
        return { valid: false, reason: 'Термін дії промокоду закінчився' }
      }
    }

    // Тип МК (E). 'any'/'будь-який'/'усі' — діє на всі типи
    const rowType = String(row[4] ?? '').trim().toLowerCase()
    const isWildcard = rowType === '' || rowType.includes('any') ||
      rowType.includes('будь') || rowType.includes('усі') || rowType.includes('всі')
    if (requiredMkType && !isWildcard && !rowType.includes(requiredMkType.toLowerCase())) {
      return { valid: false, reason: 'Цей промокод не діє на цей тип майстер-класу' }
    }

    // Знижка (C): "10", "10%", 0.1 → 10
    let disc = parseFloat(String(row[2] ?? '').replace('%', '').trim())
    if (isNaN(disc) || disc <= 0) {
      return { valid: false, reason: 'Некоректна знижка у промокоді' }
    }
    if (disc < 1) disc = disc * 100 // якщо збережено як частку (0.1)
    if (disc > 100) disc = 100

    return {
      valid: true,
      info: { rowIndex: startRow + i, discountPercent: disc, mkType: rowType },
    }
  }

  return { valid: false, reason: 'Промокод не знайдено' }
}

export async function redeemPromo(rowIndex: number, spreadsheetId?: string): Promise<void> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${config.sheets.promo}!G${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['TRUE']] },
  })
}
