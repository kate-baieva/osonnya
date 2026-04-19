import { google } from 'googleapis'
import { config } from './config'
import type { Slot } from '@/types'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

// "2025-02-15 15:30:00" → { date: "2025-02-15", time: "15:30" }
function parseDatetime(raw: string): { date: string; time: string } | null {
  if (!raw) return null
  // Handle "2025-02-15 15:30:00" or ISO "2025-02-15T15:30:00"
  const normalized = raw.trim().replace(' ', 'T')
  const dt = new Date(normalized)
  if (isNaN(dt.getTime())) return null
  const date = normalized.slice(0, 10)
  const time = normalized.slice(11, 16)
  return { date, time }
}

function rowToSlot(row: string[], rowIndex: number): Slot | null {
  const datetimeRaw = (row[0] ?? '').trim()   // A: Date (datetime)
  const capacity    = Number(row[1] ?? 0)      // B: Capacity
  const registeredRaw = (row[2] ?? '').trim()  // C: # of sign ups [auto]
  const eventId     = (row[3] ?? '').trim()    // D: EventId

  const parsed = parseDatetime(datetimeRaw)
  if (!parsed) return null

  // Пропускаємо минулі слоти
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (new Date(parsed.date) < today) return null

  // C може бути формулою-масивом — тоді вважаємо 0
  const registered = /^\d+$/.test(registeredRaw) ? Number(registeredRaw) : 0
  const spotsRemaining = capacity - registered
  if (spotsRemaining <= 0) return null

  return {
    id: eventId || `row_${rowIndex}`,
    datetime: datetimeRaw,
    date: parsed.date,
    time: parsed.time,
    capacity,
    registered,
    spotsRemaining,
  }
}

export async function getSlots(): Promise<Slot[]> {
  const sheets = getSheets()
  const startRow = config.dataRows.slots
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.slots}!A${startRow}:D`,
  })

  const rows = (res.data.values ?? []) as string[][]
  return rows
    .map((row, i) => rowToSlot(row, startRow + i))
    .filter((s): s is Slot => s !== null)
}

export async function getSlotById(slotId: string): Promise<Slot | null> {
  const slots = await getSlots()
  return slots.find((s) => s.id === slotId) ?? null
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

  // Додаємо нового клієнта
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.clients}!A:D`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[name, surname, phone, instagram ?? '']],
    },
  })

  return `${name} ${surname}`.trim()
}

export async function appendOrder(data: {
  clientFullName: string
  mkDatetime: string
  peopleCount: number
}): Promise<void> {
  const sheets = getSheets()
  const now = new Date().toISOString()

  // Колонки A–O: Order DateTime, Client, Amount, Prepayment, Prepay Date,
  // Prepay Account, Type, MK DateTime, # of People, Afterpayment,
  // Afterpay Date, Afterpay Account, Certificate #, Status, Comment
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.orders}!A:O`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        now,                    // A: Order DateTime
        data.clientFullName,    // B: Client
        '',                     // C: Amount
        '',                     // D: Prepayment
        '',                     // E: Prepay Date
        '',                     // F: Prepay Account
        'group',                // G: Type
        data.mkDatetime,        // H: MK DateTime
        String(data.peopleCount), // I: # of People
        '',                     // J: Afterpayment
        '',                     // K: Afterpay Date
        '',                     // L: Afterpay Account
        '',                     // M: Certificate #
        'booked',               // N: Status
        '',                     // O: Comment
      ]],
    },
  })
}
