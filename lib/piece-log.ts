import { getSheetsClient } from './google-sheets'
import { getSpreadsheetId } from './studios'

// Аркуш «Журнал виробів»: заголовки в рядку 1, дані з рядка 2.
// У «Pieces» лежить лише поточний статус, тож без цього журналу
// попередній стан зникає безслідно — відновити його вже не можна.
const SHEET = 'Журнал виробів'
const DATA_ROW = 2

export interface LogEntry {
  when: string
  number: string
  event: string
  status: string
  who: string
  comment: string
}

export interface NewLogEntry {
  number: string
  event: string
  status?: string
  who: string
  comment?: string
}

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Запис у журнал не має ламати основну дію: якщо статус збережено,
// а журнал недоступний — краще втратити рядок історії, ніж саму зміну.
export async function log(studioId: string, entries: NewLogEntry[]): Promise<void> {
  if (entries.length === 0) return

  try {
    const spreadsheetId = getSpreadsheetId(studioId)
    const sheets = getSheetsClient()
    const stamp = now()

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${SHEET}'!A${DATA_ROW}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: entries.map((entry) => [
          stamp,
          entry.number,
          entry.event,
          entry.status ?? '',
          entry.who,
          entry.comment ?? '',
        ]),
      },
    })
  } catch (error) {
    console.warn('[piece-log] не вдалося записати в журнал:', (error as Error).message)
  }
}

export async function getLog(studioId: string, number: string): Promise<LogEntry[]> {
  try {
    const spreadsheetId = getSpreadsheetId(studioId)
    const sheets = getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SHEET}'!A${DATA_ROW}:F`,
    })

    const wanted = String(number ?? '').trim()
    return ((res.data.values ?? []) as string[][])
      .filter((row) => String(row[1] ?? '').trim() === wanted)
      .map((row) => ({
        when: String(row[0] ?? '').trim(),
        number: String(row[1] ?? '').trim(),
        event: String(row[2] ?? '').trim(),
        status: String(row[3] ?? '').trim(),
        who: String(row[4] ?? '').trim(),
        comment: String(row[5] ?? '').trim(),
      }))
  } catch (error) {
    console.warn('[piece-log] журнал недоступний:', (error as Error).message)
    return []
  }
}
