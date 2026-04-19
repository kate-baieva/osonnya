import { google } from 'googleapis'
import { config } from './config'
import type { Slot } from '@/types'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Vercel stores \n literally — restore actual newlines
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

function col(index: number): string {
  return String.fromCharCode(64 + index) // 1→A, 2→B, …
}

function rowToSlot(row: string[], idx: number): Slot | null {
  const c = config.slotCols
  const get = (colIdx: number) => (row[colIdx - 1] ?? '').trim()

  const active = get(c.active).toUpperCase()
  if (active !== 'TRUE' && active !== '1') return null

  const date = get(c.date)
  if (!date || date < new Date().toISOString().slice(0, 10)) return null

  const capacity = Number(get(c.capacity)) || 0
  const registered = Number(get(c.registered)) || 0
  const spotsRemaining = capacity - registered
  if (spotsRemaining <= 0) return null

  const priceRaw = get(c.price)

  return {
    id: get(c.id) || String(idx),
    date,
    time: get(c.time),
    title: get(c.title),
    capacity,
    registered,
    spotsRemaining,
    price: priceRaw ? Number(priceRaw) : undefined,
  }
}

export async function getSlots(): Promise<Slot[]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.slots}!A2:Z`,
  })

  const rows = res.data.values ?? []
  return rows
    .map((row, idx) => rowToSlot(row as string[], idx + 2))
    .filter((s): s is Slot => s !== null)
}

export async function getSlotById(slotId: string): Promise<{ slot: Slot; rowIndex: number } | null> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.slots}!A2:Z`,
  })

  const rows = (res.data.values ?? []) as string[][]
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const id = (row[config.slotCols.id - 1] ?? '').trim()
    if (id === slotId) {
      const slot = rowToSlot(row, i + 2)
      if (slot) return { slot, rowIndex: i + 2 }
    }
  }
  return null
}

export async function incrementRegistered(rowIndex: number): Promise<void> {
  const sheets = getSheets()
  const colLetter = col(config.slotCols.registered)
  const range = `${config.sheets.slots}!${colLetter}${rowIndex}`

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  })
  const currentVal = Number((current.data.values?.[0]?.[0] ?? '0')) || 0

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[String(currentVal + 1)]] },
  })
}

export async function appendRegistration(data: {
  slotId: string
  slotDate: string
  slotTime: string
  name: string
  phone: string
  peopleCount: number
}): Promise<void> {
  const sheets = getSheets()
  const timestamp = new Date().toISOString()

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.registrations}!A:H`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        timestamp,
        data.slotId,
        data.slotDate,
        data.slotTime,
        data.name,
        data.phone,
        String(data.peopleCount),
        'pending',
      ]],
    },
  })
}
