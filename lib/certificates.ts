import { getSheetsClient, readValues } from './google-sheets'
import { getSpreadsheetId } from './studios'
import { insertRowAfterData } from './sheet-rows'

// Аркуш «Certificate Orders»: заголовки в рядку 6, дані з рядка 7.
const SHEET = 'Certificate Orders'
const HEADER_ROW = 6
const DATA_ROW = 7

export const PAPER = 'паперовий'
export const DIGITAL = 'електронний'

type Field =
  | 'orderedAt' | 'client' | 'amount' | 'people' | 'dueDate'
  | 'mkType' | 'number' | 'paymentDate' | 'account'
  | 'utilized' | 'expired' | 'type' | 'issued'

const HEADERS: Record<string, Field> = {
  'order datetime': 'orderedAt',
  'client': 'client',
  'amount': 'amount',
  '# of people': 'people',
  'due date': 'dueDate',
  'mk type': 'mkType',
  'number': 'number',
  'payment date': 'paymentDate',
  'payment account': 'account',
  'utilized? [auto]': 'utilized',
  'expired [auto]': 'expired',
  'тип': 'type',
  'видано': 'issued',
}

export interface Certificate {
  rowIndex: number
  number: string
  client: string
  amount: number
  paid: number
  people: number
  dueDate: string
  mkType: string
  account: string
  type: string
  issued: string
  used: boolean
  expired: boolean
  awaitingPickup: boolean
}

type ColumnMap = Partial<Record<Field, number>>

function normalize(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function columnLetter(index: number): string {
  let out = ''
  let n = index
  while (n >= 0) { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1 }
  return out
}

function toNumber(value: string): number {
  const parsed = parseFloat(String(value ?? '').replace(/\s/g, '').replace(',', '.'))
  return isNaN(parsed) ? 0 : parsed
}

function isTrue(value: string): boolean {
  const text = normalize(value)
  return text === 'true' || text === 'так' || text === '1'
}

// "1/29/2025" → час, щоб порівнювати з сьогодні
function dueTime(value: string): number {
  const mdy = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!mdy) return 0
  const [, month, day, year] = mdy
  return new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59).getTime()
}

async function columnMap(spreadsheetId: string): Promise<ColumnMap> {
  const header = (await readValues(spreadsheetId, `'${SHEET}'!A${HEADER_ROW}:AZ${HEADER_ROW}`))[0] ?? []
  const map: ColumnMap = {}
  header.forEach((raw, index) => {
    const field = HEADERS[normalize(raw)]
    if (field && map[field] === undefined) map[field] = index
  })
  return map
}

export async function getCertificates(studioId: string): Promise<Certificate[]> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const [map, rows] = await Promise.all([
    columnMap(spreadsheetId),
    readValues(spreadsheetId, `'${SHEET}'!A${DATA_ROW}:AZ`),
  ])

  const cell = (row: string[], field: Field) => {
    const index = map[field]
    return index === undefined ? '' : String(row[index] ?? '').trim()
  }

  const now = Date.now()
  const list: Certificate[] = []

  rows.forEach((row, i) => {
    const number = cell(row, 'number')
    if (!number) return

    const amount = toNumber(cell(row, 'amount'))
    // Дата оплати порожня — значить, гроші ще не внесені
    const paid = cell(row, 'paymentDate') ? amount : 0
    const due = dueTime(cell(row, 'dueDate'))
    const type = cell(row, 'type')
    const issued = cell(row, 'issued')
    const used = isTrue(cell(row, 'utilized'))
    const expired = due > 0 ? due < now : isTrue(cell(row, 'expired'))

    list.push({
      rowIndex: DATA_ROW + i,
      number,
      client: cell(row, 'client'),
      amount,
      paid,
      people: Number(cell(row, 'people')) || 0,
      dueDate: cell(row, 'dueDate'),
      mkType: cell(row, 'mkType'),
      account: cell(row, 'account'),
      type,
      issued,
      used,
      expired,
      // Паперовий, за яким ще не прийшли: виданий лише той, де стоїть дата
      awaitingPickup: normalize(type) === PAPER && !issued && !used && !expired,
    })
  })

  return list
}

export async function markIssued(studioId: string, rowIndex: number): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await columnMap(spreadsheetId)
  if (map.issued === undefined) throw new Error('В аркуші Certificate Orders немає колонки «Видано»')

  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`

  await getSheetsClient().spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET}'!${columnLetter(map.issued)}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[stamp]] },
  })
}

export async function getNextNumber(studioId: string): Promise<string> {
  const list = await getCertificates(studioId)
  let max = 9999
  for (const cert of list) {
    const parsed = parseInt(cert.number, 10)
    if (!isNaN(parsed) && parsed > max) max = parsed
  }
  return String(max + 1)
}

export interface NewCertificate {
  client: string
  amount: number
  people: number
  mkType: string
  account: string
  type: string
}

// Продаж у студії: сертифікат одразу оплачений і одразу на руках
export async function sellCertificate(
  studioId: string,
  data: NewCertificate,
): Promise<{ number: string; dueDate: string }> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await columnMap(spreadsheetId)
  const number = await getNextNumber(studioId)

  const now = new Date()
  const due = new Date(now)
  due.setMonth(due.getMonth() + 3)
  const pad = (n: number) => String(n).padStart(2, '0')
  const sheetDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  const stamp = `${sheetDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const dueDate = sheetDate(due)

  const width = Math.max(...Object.values(map).map((i) => i as number)) + 1
  const row = new Array<string | number>(width).fill('')
  const put = (field: Field, value: string | number) => {
    const index = map[field]
    if (index !== undefined) row[index] = value
  }

  put('orderedAt', stamp)
  put('client', data.client)
  put('amount', data.amount)
  put('people', data.people)
  put('dueDate', dueDate)
  put('mkType', data.mkType)
  put('number', number)
  put('paymentDate', stamp)
  put('account', data.account)
  put('type', data.type)
  // Куплений у студії — його забирають одразу, тож видача не потрібна
  if (data.type === PAPER) put('issued', `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`)

  await insertRowAfterData(spreadsheetId, SHEET, DATA_ROW, columnLetter(map.number ?? 6), row)
  return { number, dueDate }
}
