import { google } from 'googleapis'
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

// Знаходить клієнта за телефоном або додає нового. Повертає повне ім'я.
export async function findOrCreateClient(
  name: string,
  surname: string,
  phone: string,
  instagram?: string,
  spreadsheetId?: string,
): Promise<string> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()
  const startRow = config.dataRows.clients

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${config.sheets.clients}!A${startRow}:D`,
  })

  const rows = (res.data.values ?? []) as string[][]
  for (const row of rows) {
    const existingPhone = (row[2] ?? '').trim()
    if (existingPhone === phone) {
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

  return `${name} ${surname}`.trim()
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
    totalAmount?: number     // явна сума (для індивідуального МК)
    mkType?: string          // 'group' (default) | 'individual'
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

export async function getIndividualPrices(spreadsheetId?: string): Promise<IndividualPrice[]> {
  const sid = spreadsheetId ?? config.spreadsheetId
  const sheets = getSheets()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: 'Prices!A1:D25',
  })

  const rows = (res.data.values ?? []) as string[][]
  const result: IndividualPrice[] = []

  for (const row of rows) {
    const service  = (row[0] ?? '').trim()
    const price1Str = (row[2] ?? '').trim()
    const price2Str = (row[3] ?? '').trim()

    // Пропускаємо порожні, заголовки, Груповий МК та Оренда
    if (!service || !price1Str) continue
    const low = service.toLowerCase()
    if (low.includes('service') || low.includes('груповий') || low.includes('оренд')) continue

    // Кількість — з назви (найнадійніше, бо в Amount є друкарські помилки)
    // Матчить: "3 людини", "5 людей", "10 люди"
    const nameMatch = service.match(/(\d+)\s*люд/)
    const peopleCount = nameMatch ? parseInt(nameMatch[1])
      : service.toLowerCase().includes('парний') ? 2
      : null

    if (!peopleCount) continue

    const priceWeekday = parseInt(price1Str)
    const priceWeekend = price2Str && !isNaN(parseInt(price2Str)) ? parseInt(price2Str) : null

    if (isNaN(priceWeekday)) continue

    result.push({ peopleCount, label: service, priceWeekday, priceWeekend })
  }

  // Сортуємо за кількістю учасників
  return result.sort((a, b) => a.peopleCount - b.peopleCount)
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
