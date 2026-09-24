import { getSheetsClient } from './google-sheets'
import { getSpreadsheetId } from './studios'
import { insertRowAfterData } from './sheet-rows'
import type { Piece, PieceStatus } from './piece-types'

// Аркуш «Pieces»: заголовки в рядку 3, дані з рядка 4.
// Колонки в Сумах та ІФ відрізняються (у Сумах є зайва «Stored till»),
// тому шукаємо їх за назвою заголовка, а не за буквою.
const SHEET = 'Pieces'
const HEADER_ROW = 3
const DATA_ROW = 4

export type { Piece, PieceStatus }
export { PIECE_STATUSES, NOTIFIED } from './piece-types'

type Field = 'number' | 'client' | 'mkDate' | 'status' | 'communication' | 'comment' | 'master' | 'photoUrl'

// Назва заголовка (нормалізована) → поле виробу
const HEADER_FIELDS: Record<string, Field> = {
  '№': 'number',
  'client': 'client',
  'date of mk': 'mkDate',
  'status': 'status',
  'communication': 'communication',
  'comment': 'comment',
  'майстриня': 'master',
  'фото': 'photoUrl',
}

// Колонки, яких в аркуші ще немає — додаємо праворуч, не чіпаючи наявні
const ADDED_HEADERS: { header: string; field: Field }[] = [
  { header: 'Майстриня', field: 'master' },
  { header: 'Фото', field: 'photoUrl' },
]

type ColumnMap = Partial<Record<Field, number>>

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function columnLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

function buildColumnMap(header: string[]): ColumnMap {
  const map: ColumnMap = {}
  header.forEach((raw, index) => {
    const field = HEADER_FIELDS[normalizeHeader(raw ?? '')]
    if (field && map[field] === undefined) map[field] = index
  })
  return map
}

async function readHeader(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET}!A${HEADER_ROW}:Z${HEADER_ROW}`,
  })
  return (res.data.values?.[0] ?? []) as string[]
}

// Дописує заголовки «Майстриня» / «Фото», якщо їх ще немає.
async function ensureColumns(spreadsheetId: string): Promise<ColumnMap> {
  const header = await readHeader(spreadsheetId)
  const map = buildColumnMap(header)

  const missing = ADDED_HEADERS.filter((c) => map[c.field] === undefined)
  if (missing.length === 0) return map

  const sheets = getSheetsClient()
  let nextIndex = header.length
  const updates = missing.map((column) => {
    const index = nextIndex++
    map[column.field] = index
    return {
      range: `${SHEET}!${columnLetter(index)}${HEADER_ROW}`,
      values: [[column.header]],
    }
  })

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data: updates },
  })

  return map
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return ''
  return (row[index] ?? '').toString().trim()
}

export async function getPieces(studioId: string): Promise<Piece[]> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await ensureColumns(spreadsheetId)

  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET}!A${DATA_ROW}:Z`,
  })

  const rows = (res.data.values ?? []) as string[][]
  const pieces: Piece[] = []

  rows.forEach((row, i) => {
    const number = cell(row, map.number)
    if (!number) return
    pieces.push({
      rowIndex: DATA_ROW + i,
      number,
      client: cell(row, map.client),
      mkDate: cell(row, map.mkDate),
      status: cell(row, map.status),
      communication: cell(row, map.communication),
      comment: cell(row, map.comment),
      master: cell(row, map.master),
      photoUrl: cell(row, map.photoUrl),
    })
  })

  return pieces
}

export async function getNextPieceNumber(studioId: string): Promise<string> {
  const pieces = await getPieces(studioId)
  let max = 10000
  for (const piece of pieces) {
    const parsed = parseInt(piece.number, 10)
    if (!isNaN(parsed) && parsed > max) max = parsed
  }
  return String(max + 1)
}

export interface StatusChange {
  rowIndex: number
  status: PieceStatus
  comment?: string
}

// Масова зміна статусів — одним запитом, щоб не впертись у ліміти API.
export async function updateStatuses(studioId: string, changes: StatusChange[]): Promise<void> {
  if (changes.length === 0) return

  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await ensureColumns(spreadsheetId)
  if (map.status === undefined) throw new Error('В аркуші Pieces немає колонки Status')

  const statusColumn = columnLetter(map.status)
  const commentColumn = map.comment !== undefined ? columnLetter(map.comment) : null

  const data = changes.flatMap((change) => {
    const entries: { range: string; values: string[][] }[] = [{
      range: `${SHEET}!${statusColumn}${change.rowIndex}`,
      values: [[change.status]],
    }]
    if (change.comment !== undefined && commentColumn) {
      entries.push({
        range: `${SHEET}!${commentColumn}${change.rowIndex}`,
        values: [[change.comment]],
      })
    }
    return entries
  })

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  })
}

export interface NewPiece {
  number: string
  client: string
  mkDate: string
  status: PieceStatus
  master: string
  comment?: string
  photoUrl?: string
}

export async function addPieces(studioId: string, pieces: NewPiece[]): Promise<void> {
  if (pieces.length === 0) return

  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await ensureColumns(spreadsheetId)

  const width = Math.max(...Object.values(map).map((i) => i as number)) + 1

  const values = pieces.map((piece) => {
    const row = new Array<string>(width).fill('')
    const put = (field: Field, value: string) => {
      const index = map[field]
      if (index !== undefined) row[index] = value
    }
    put('number', piece.number)
    put('client', piece.client)
    put('mkDate', piece.mkDate)
    put('status', piece.status)
    put('master', piece.master)
    if (piece.comment) put('comment', piece.comment)
    if (piece.photoUrl) put('photoUrl', piece.photoUrl)
    return row
  })

  // Той самий спосіб, що й у розкладі: append від Google кладе рядок у кінець аркуша
  for (const row of values) {
    await insertRowAfterData(spreadsheetId, SHEET, DATA_ROW, columnLetter(map.number ?? 0), row)
  }
}
