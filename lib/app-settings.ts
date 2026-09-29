import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { getSheetsClient } from './google-sheets'

// Дрібні налаштування застосунку — в окремому аркуші основної таблиці.
// Секрети (токен Drive) лежать там зашифрованими: доступу до таблиці
// самого по собі недостатньо, потрібен ще SESSION_SECRET із сервера.

const SHEET = 'App Settings'
const HEADER = ['Ключ', 'Значення', 'Оновлено']
const DATA_ROW = 2

function key(): Buffer {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET не налаштований')
  return scryptSync(secret, 'osonnya-settings', 32)
}

export function encrypt(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}

export function decrypt(value: string): string | null {
  const [ivPart, tagPart, dataPart] = String(value ?? '').split('.')
  if (!ivPart || !tagPart || !dataPart) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivPart, 'base64'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

function spreadsheetId(): string {
  return process.env.GOOGLE_SPREADSHEET_ID!
}

async function ensureSheet(): Promise<void> {
  const sheets = getSheetsClient()
  const id = spreadsheetId()

  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets(properties(title))' })
  if (meta.data.sheets?.some((s) => s.properties?.title === SHEET)) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'${SHEET}'!A1:C1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER] },
  })
}

export async function getSetting(name: string): Promise<string | null> {
  await ensureSheet()
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `'${SHEET}'!A${DATA_ROW}:B`,
  })
  const rows = (res.data.values ?? []) as string[][]
  const found = rows.find((row) => String(row[0] ?? '').trim() === name)
  return found ? String(found[1] ?? '') : null
}

export async function setSetting(name: string, value: string): Promise<void> {
  await ensureSheet()
  const sheets = getSheetsClient()
  const id = spreadsheetId()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${SHEET}'!A${DATA_ROW}:A`,
  })
  const rows = (res.data.values ?? []) as string[][]
  const index = rows.findIndex((row) => String(row[0] ?? '').trim() === name)
  const row = index === -1 ? DATA_ROW + rows.length : DATA_ROW + index

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'${SHEET}'!A${row}:C${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[name, value, now]] },
  })
}
