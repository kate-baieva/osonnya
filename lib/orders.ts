import { getSheetsClient, readValues } from './google-sheets'
import { getSpreadsheetId } from './studios'
import { insertRowAfterData } from './sheet-rows'
import { parseDatetime } from './schedule'

// Аркуш «MK Orders»: заголовки в рядку 6, дані з рядка 7.
// Тут живуть і записи на групові МК, і самі індивідуальні МК.
const SHEET = 'MK Orders'
const HEADER_ROW = 6
const DATA_ROW = 7

type Field =
  | 'orderedAt' | 'client' | 'amount'
  | 'prepayment' | 'prepayDate' | 'prepayAccount'
  | 'type' | 'mkDatetime' | 'people'
  | 'afterpayment' | 'afterpayDate' | 'afterpayAccount'
  | 'certificate' | 'status' | 'comment' | 'promo'
  | 'master' | 'attended'

const HEADERS: Record<string, Field> = {
  'order datetime': 'orderedAt',
  'client': 'client',
  'amount': 'amount',
  'prepayment': 'prepayment',
  'prepay date': 'prepayDate',
  'prepay account': 'prepayAccount',
  'type': 'type',
  'mk datetime': 'mkDatetime',
  '# of people': 'people',
  'afterpayment': 'afterpayment',
  'afterpay date': 'afterpayDate',
  'afterpay account': 'afterpayAccount',
  'certificate #': 'certificate',
  'status': 'status',
  'comment': 'comment',
  'промокод': 'promo',
  'майстриня': 'master',
  'прийшло осіб': 'attended',
}

export interface Order {
  rowIndex: number
  client: string
  phone: string
  email: string
  type: string
  mkDatetime: string
  mkKey: string       // YYYY-MM-DD HH:MM
  people: number
  attended: number | null // null — ще не звіряли
  amount: number
  prepayment: number
  afterpayment: number
  paid: number
  debt: number
  byCertificate: boolean
  certificate: string
  promo: string
  status: string
  comment: string
  master: string
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
  const cleaned = String(value ?? '').replace(/\s/g, '').replace(',', '.')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

export function mkKeyOf(raw: string): string {
  const parsed = parseDatetime(raw)
  return parsed ? `${parsed.date} ${parsed.time}` : ''
}

async function readColumnMap(spreadsheetId: string): Promise<ColumnMap> {
  const sheets = getSheetsClient()
  const rows = await readValues(spreadsheetId, `'${SHEET}'!A${HEADER_ROW}:AZ${HEADER_ROW}`)
  const header = (rows[0] ?? []) as string[]

  const map: ColumnMap = {}
  header.forEach((raw, index) => {
    const field = HEADERS[normalize(raw)]
    if (field && map[field] === undefined) map[field] = index
  })
  return map
}

// Телефон і пошту тримає аркуш «Clients», у замовленні лише повне ім'я
async function readContacts(spreadsheetId: string): Promise<Map<string, { phone: string; email: string }>> {
  const sheets = getSheetsClient()
  const contacts = new Map<string, { phone: string; email: string }>()
  try {
    for (const row of await readValues(spreadsheetId, "'Clients'!A6:G")) {
      const full = `${String(row[0] ?? '').trim()} ${String(row[1] ?? '').trim()}`.trim()
      if (!full) continue
      contacts.set(normalize(full), {
        phone: String(row[2] ?? '').trim(),
        email: String(row[5] ?? '').trim(),
      })
    }
  } catch {
    // контакти не критичні — сторінка працює й без них
  }
  return contacts
}

export async function getOrders(studioId: string): Promise<Order[]> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const sheets = getSheetsClient()

  const [map, contacts, rows] = await Promise.all([
    readColumnMap(spreadsheetId),
    readContacts(spreadsheetId),
    readValues(spreadsheetId, `'${SHEET}'!A${DATA_ROW}:AZ`),
  ])
  const cell = (row: string[], field: Field) => {
    const index = map[field]
    return index === undefined ? '' : String(row[index] ?? '').trim()
  }

  const orders: Order[] = []
  rows.forEach((row, i) => {
    const client = cell(row, 'client')
    const mkDatetime = cell(row, 'mkDatetime')
    if (!client && !mkDatetime) return

    const prepayment = toNumber(cell(row, 'prepayment'))
    const afterpayment = toNumber(cell(row, 'afterpayment'))
    const amount = toNumber(cell(row, 'amount'))
    const attendedRaw = cell(row, 'attended')
    const certificate = cell(row, 'certificate')
    // Сертифікат покриває вартість — рядок з ним не боржник, навіть якщо оплат нема
    const byCertificate = certificate !== '' || cell(row, 'status') === 'certificate'

    orders.push({
      rowIndex: DATA_ROW + i,
      client,
      phone: contacts.get(normalize(client))?.phone ?? '',
      email: contacts.get(normalize(client))?.email ?? '',
      type: cell(row, 'type'),
      mkDatetime,
      mkKey: mkKeyOf(mkDatetime),
      people: Number(cell(row, 'people')) || 0,
      attended: attendedRaw === '' ? null : Number(attendedRaw) || 0,
      amount,
      prepayment,
      afterpayment,
      paid: prepayment + afterpayment,
      // Оплачене сертифікатом грошима не проходить — боргом це не є
      debt: byCertificate ? 0 : Math.max(0, amount - prepayment - afterpayment),
      byCertificate,
      certificate,
      promo: cell(row, 'promo'),
      status: cell(row, 'status'),
      comment: cell(row, 'comment'),
      master: cell(row, 'master'),
    })
  })

  return orders
}

export async function getOrdersForMk(studioId: string, mkKey: string): Promise<Order[]> {
  const orders = await getOrders(studioId)
  return orders.filter((order) => order.mkKey === mkKey)
}

function formatSheetDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Доплата додається до наявної, а не перезаписує її
export async function addPayment(
  studioId: string,
  rowIndex: number,
  payment: { amount: number; account: string; date?: string },
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const sheets = getSheetsClient()
  const map = await readColumnMap(spreadsheetId)

  if (map.afterpayment === undefined) throw new Error('В аркуші MK Orders немає колонки Afterpayment')

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET}'!${columnLetter(map.afterpayment)}${rowIndex}`,
  })
  const existing = toNumber(String(current.data.values?.[0]?.[0] ?? ''))
  const when = payment.date ? `${payment.date} 00:00:00` : formatSheetDate(new Date())

  const data: { range: string; values: (string | number)[][] }[] = [{
    range: `'${SHEET}'!${columnLetter(map.afterpayment)}${rowIndex}`,
    values: [[existing + payment.amount]],
  }]
  if (map.afterpayDate !== undefined) {
    data.push({ range: `'${SHEET}'!${columnLetter(map.afterpayDate)}${rowIndex}`, values: [[when]] })
  }
  if (map.afterpayAccount !== undefined) {
    data.push({ range: `'${SHEET}'!${columnLetter(map.afterpayAccount)}${rowIndex}`, values: [[payment.account]] })
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  })
}

export async function setAttendance(
  studioId: string,
  rowIndex: number,
  attended: number,
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await readColumnMap(spreadsheetId)
  if (map.attended === undefined) throw new Error('В аркуші MK Orders немає колонки «Прийшло осіб»')

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET}'!${columnLetter(map.attended)}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[attended]] },
  })
}

// Місця рахуються формулою лише для статусу «booked»,
// тож скасування — це просто інший статус: місце звільняється саме
export async function setOrderStatus(
  studioId: string,
  rowIndex: number,
  status: string,
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await readColumnMap(spreadsheetId)
  if (map.status === undefined) throw new Error('В аркуші MK Orders немає колонки Status')

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET}'!${columnLetter(map.status)}${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  })
}

// Перенесення на інший майстер-клас — зміна дати й часу в самому записі
export async function moveOrder(
  studioId: string,
  rowIndex: number,
  mkDatetime: string,
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await readColumnMap(spreadsheetId)
  if (map.mkDatetime === undefined) throw new Error('В аркуші MK Orders немає колонки MK DateTime')

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET}'!${columnLetter(map.mkDatetime)}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[mkDatetime]] },
  })
}

export async function setOrderMaster(
  studioId: string,
  rowIndex: number,
  master: string,
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await readColumnMap(spreadsheetId)
  if (map.master === undefined) throw new Error('В аркуші MK Orders немає колонки «Майстриня»')

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET}'!${columnLetter(map.master)}${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[master]] },
  })
}

export interface WalkIn {
  client: string
  mkDatetime: string
  people: number
  amount: number
  paid: number
  account: string
  type: string
  certificate?: string
  promo?: string
}

// Людина без запису — новий рядок у MK Orders з одразу проставленою оплатою
export async function addWalkIn(studioId: string, entry: WalkIn): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const map = await readColumnMap(spreadsheetId)

  const width = Math.max(...Object.values(map).map((i) => i as number)) + 1
  const row = new Array<string | number>(width).fill('')
  const put = (field: Field, value: string | number) => {
    const index = map[field]
    if (index !== undefined) row[index] = value
  }

  const now = formatSheetDate(new Date())
  put('orderedAt', now)
  put('client', entry.client)
  put('amount', entry.amount)
  put('type', entry.type)
  put('mkDatetime', entry.mkDatetime)
  put('people', entry.people)
  put('status', 'booked')
  put('comment', 'Без запису')
  put('attended', entry.people)
  if (entry.paid > 0) {
    put('afterpayment', entry.paid)
    put('afterpayDate', now)
    put('afterpayAccount', entry.account)
  }
  if (entry.certificate) put('certificate', entry.certificate)
  if (entry.promo) put('promo', entry.promo)

  await insertRowAfterData(spreadsheetId, SHEET, DATA_ROW, 'A', row)
}
