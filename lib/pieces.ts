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

export const COLLECTED_STATUS = 'Забрали'

export async function setPhoto(
  studioId: string,
  rowIndex: number,
  url: string,
  actor?: string,
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await ensureColumns(spreadsheetId)
  if (map.photoUrl === undefined) throw new Error('В аркуші Pieces немає колонки «Фото»')

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET}!${columnLetter(map.photoUrl)}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[url]] },
  })

  if (actor) {
    const piece = (await getPieces(studioId)).find((p) => p.rowIndex === rowIndex)
    const { log } = await import('./piece-log')
    await log(studioId, [{ number: piece?.number ?? '', event: 'Фото додано', who: actor }])
  }
}

// Масова зміна статусів — одним запитом, щоб не впертись у ліміти API.
export async function updateStatuses(
  studioId: string,
  changes: StatusChange[],
  actor?: string,
): Promise<void> {
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

  await archiveCollectedPhotos(studioId, changes)

  // Історія пишеться після збереження: у «Pieces» лишається лише поточний
  // статус, і без журналу попередній стан уже не відновити
  if (actor) {
    const byRow = new Map((await getPieces(studioId)).map((p) => [p.rowIndex, p]))
    const { log } = await import('./piece-log')
    await log(studioId, changes.map((change) => ({
      number: byRow.get(change.rowIndex)?.number ?? '',
      event: `Статус «${change.status}»`,
      status: change.status,
      who: actor,
      comment: change.comment,
    })))
  }
}

// Виріб забрали — фото переїжджає в підпапку «Віддали».
// Помилки тут не мають ламати зміну статусу: статус уже збережений.
async function archiveCollectedPhotos(studioId: string, changes: StatusChange[]): Promise<void> {
  const collected = changes.filter((change) => change.status === COLLECTED_STATUS)
  if (collected.length === 0) return

  try {
    const { fileIdFromUrl, moveToDelivered } = await import('./drive')
    const pieces = await getPieces(studioId)
    const byRow = new Map(pieces.map((piece) => [piece.rowIndex, piece]))

    for (const change of collected) {
      const fileId = fileIdFromUrl(byRow.get(change.rowIndex)?.photoUrl ?? '')
      if (!fileId) continue
      await moveToDelivered(studioId, fileId).catch((error) =>
        console.warn('[pieces] фото не перенеслося в «Віддали»:', error?.message))
    }
  } catch (error) {
    console.warn('[pieces] перенесення фото пропущено:', error)
  }
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

// Вироби конкретного майстер-класу — за датою й часом МК
export async function getPiecesForMk(studioId: string, mkKey: string): Promise<Piece[]> {
  const { mkKeyOf } = await import('./orders')
  const pieces = await getPieces(studioId)
  return pieces.filter((piece) => mkKeyOf(piece.mkDate) === mkKey)
}

// Один виріб — повертає рядок і номер, щоб одразу прикріпити фото
export async function addPiece(
  studioId: string,
  piece: { client: string; mkDate: string; status: PieceStatus; master: string },
): Promise<{ rowIndex: number; number: string }> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await ensureColumns(spreadsheetId)
  const number = await getNextPieceNumber(studioId)

  const width = Math.max(...Object.values(map).map((i) => i as number)) + 1
  const row = new Array<string>(width).fill('')
  const put = (field: Field, value: string) => {
    const index = map[field]
    if (index !== undefined) row[index] = value
  }
  put('number', number)
  put('client', piece.client)
  put('mkDate', piece.mkDate)
  put('status', piece.status)
  put('master', piece.master)

  const rowIndex = await insertRowAfterData(
    spreadsheetId, SHEET, DATA_ROW, columnLetter(map.number ?? 0), row,
  )

  const { log } = await import('./piece-log')
  await log(studioId, [{
    number,
    event: 'Створений на майстер-класі',
    status: piece.status,
    who: piece.master,
  }])

  return { rowIndex, number }
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
