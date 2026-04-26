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
  const datetimeRaw = (row[0] ?? '').trim()   // A: Date (datetime)
  const capacity    = Number(row[1] ?? 0)      // B: Capacity
  const registeredRaw = (row[2] ?? '').trim()  // C: # of sign ups [auto]
  const eventId     = (row[3] ?? '').trim()    // D: EventId
  const title       = (row[4] ?? '').trim()    // E: Name

  console.log(`[row ${rowIndex}] raw:`, { datetimeRaw, capacity, registeredRaw, eventId })

  const parsed = parseDatetime(datetimeRaw)
  if (!parsed) {
    console.log(`[row ${rowIndex}] ❌ не вдалось розпарсити дату: "${datetimeRaw}"`)
    return null
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (new Date(parsed.date) < today) {
    console.log(`[row ${rowIndex}] ❌ минула дата: ${parsed.date}`)
    return null
  }

  const registered = /^\d+$/.test(registeredRaw) ? Number(registeredRaw) : 0
  const spotsRemaining = capacity - registered
  if (spotsRemaining <= 0) {
    console.log(`[row ${rowIndex}] ❌ немає місць: capacity=${capacity}, registered=${registered}`)
    return null
  }

  console.log(`[row ${rowIndex}] ✅ слот: ${parsed.date} ${parsed.time}, місць: ${spotsRemaining}`)
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

export async function getSlots(): Promise<Slot[]> {
  const sheets = getSheets()
  const startRow = config.dataRows.slots
  const range = `${config.sheets.slots}!A${startRow}:E`
  console.log(`[getSlots] читаю діапазон: "${range}"`)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  })

  const rows = (res.data.values ?? []) as string[][]
  console.log(`[getSlots] отримано рядків: ${rows.length}`)
  if (rows.length > 0) console.log(`[getSlots] перший рядок:`, rows[0])
  return rows
    .map((row, i) => rowToSlot(row, startRow + i))
    .filter((s): s is Slot => s !== null)
}

export async function getSlotById(slotId: string): Promise<Slot | null> {
  const slots = await getSlots()
  return slots.find((s) => s.id === slotId) ?? null
}

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

// Знаходить перший порожній рядок після останнього запису (ігнорує pre-formatted пусті рядки)
async function findNextRow(sheetName: string, startRow: number): Promise<number> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
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

// Знаходить клієнта за телефоном або додає нового. Повертає повне ім'я.
export async function findOrCreateClient(
  name: string,
  surname: string,
  phone: string,
  instagram?: string,
): Promise<string> {
  const sheets = getSheets()
  const startRow = config.dataRows.clients

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.clients}!A${startRow}:D`,
  })

  const rows = (res.data.values ?? []) as string[][]
  for (const row of rows) {
    const existingPhone = (row[2] ?? '').trim()
    if (existingPhone === phone) {
      // Клієнт вже існує
      return `${(row[0] ?? '').trim()} ${(row[1] ?? '').trim()}`.trim()
    }
  }

  // Додаємо нового клієнта одразу після останнього запису
  const nextRow = await findNextRow(config.sheets.clients, config.dataRows.clients)
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.clients}!A${nextRow}:D${nextRow}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[name, surname, phone, instagram ?? '']],
    },
  })

  return `${name} ${surname}`.trim()
}

// Повертає номер рядка, щоб вебхук міг оновити передоплату
export async function appendOrder(data: {
  clientFullName: string
  mkDatetime: string
  peopleCount: number
  orderReference: string  // зберігаємо в Comment для пошуку з вебхука
}): Promise<number> {
  const sheets = getSheets()
  const now = formatDateSheet(new Date())
  const nextRow = await findNextRow(config.sheets.orders, config.dataRows.orders)

  // Колонки A–O: Order DateTime, Client, Amount, Prepayment, Prepay Date,
  // Prepay Account, Type, MK DateTime, # of People, Afterpayment,
  // Afterpay Date, Afterpay Account, Certificate #, Status, Comment
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.orders}!A${nextRow}:O${nextRow}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        now,                   // A: Order DateTime
        data.clientFullName,   // B: Client
        '',                    // C: Amount
        '',                    // D: Prepayment
        '',                    // E: Prepay Date
        '',                    // F: Prepay Account
        'group',               // G: Type
        data.mkDatetime,       // H: MK DateTime
        data.peopleCount,      // I: # of People
        '',                    // J: Afterpayment
        '',                    // K: Afterpay Date
        '',                    // L: Afterpay Account
        '',                    // M: Certificate #
        'booked',              // N: Status
        data.orderReference,   // O: Comment — зберігаємо для вебхука
      ]],
    },
  })

  return nextRow
}

// Знаходить рядок замовлення за orderReference (у колонці O — Comment)
export async function findOrderRowByReference(orderReference: string): Promise<number | null> {
  const sheets = getSheets()
  const startRow = config.dataRows.orders

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.orders}!O${startRow}:O`,
  })

  const rows = (res.data.values ?? []) as string[][]
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i]?.[0] ?? '').trim() === orderReference) {
      return startRow + i
    }
  }
  return null
}

// Заповнює передоплату після успішної оплати через WayForPay
export async function updateOrderPrepayment(rowIndex: number, amount: number): Promise<void> {
  const sheets = getSheets()
  const payDate = formatDateSheet(new Date())

  // D: Prepayment, E: Prepay Date, F: Prepay Account
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.orders}!D${rowIndex}:F${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[amount, payDate, 'WayForPay']],
    },
  })
}
