import { getSheetsClient } from './google-sheets'
import { getSpreadsheetId } from './studios'

// Розклад зводиться з двох аркушів:
//   «Group MKs»   — слоти, на які записує сайт
//   «Резерв часу» — дитячі МК та інший зайнятий час, куди записів немає
const GROUP_SHEET = 'Group MKs'
const GROUP_HEADER_ROW = 6
const GROUP_DATA_ROW = 7

const RESERVED_SHEET = 'Резерв часу'
const RESERVED_DATA_ROW = 2

export type MkType = 'group' | 'indiv' | 'kids'

export interface ScheduleItem {
  id: string
  source: 'group' | 'reserved'
  rowIndex: number
  datetime: string // сире значення з таблиці
  date: string     // YYYY-MM-DD
  time: string     // HH:MM
  type: MkType
  title: string
  capacity: number
  booked: number
  master: string
  eventId: string
}

type GroupField = 'date' | 'capacity' | 'booked' | 'eventId' | 'name' | 'type' | 'master'

const GROUP_HEADERS: Record<string, GroupField> = {
  'date': 'date',
  'capacity': 'capacity',
  '# of sing ups [auto]': 'booked',
  '# of sign ups [auto]': 'booked',
  'eventid [auto]': 'eventId',
  'name': 'name',
  'type': 'type',
  'майстриня': 'master',
}

function normalize(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function columnLetter(index: number): string {
  let out = ''
  let n = index
  while (n >= 0) { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1 }
  return out
}

// "2/15/2025 15:30:00" або ISO
export function parseDatetime(raw: string): { date: string; time: string } | null {
  if (!raw) return null
  const str = String(raw).trim()

  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (mdy) {
    const [, month, day, year, hour, minute] = mdy
    return {
      date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      time: `${(hour ?? '0').padStart(2, '0')}:${minute ?? '00'}`,
    }
  }

  const parsed = new Date(str.replace(' ', 'T'))
  if (isNaN(parsed.getTime())) return null
  return {
    date: parsed.toISOString().slice(0, 10),
    time: str.slice(11, 16) || '00:00',
  }
}

function typeFromText(value: string): MkType {
  const text = normalize(value)
  if (text.includes('дит') || text.includes('kids')) return 'kids'
  if (text.includes('індив') || text.includes('indiv') || text.includes('парн')) return 'indiv'
  return 'group'
}

async function readGroupSlots(spreadsheetId: string): Promise<ScheduleItem[]> {
  const sheets = getSheetsClient()

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${GROUP_SHEET}'!A${GROUP_HEADER_ROW}:Z${GROUP_HEADER_ROW}`,
  })
  const header = (headerRes.data.values?.[0] ?? []) as string[]

  const map: Partial<Record<GroupField, number>> = {}
  header.forEach((raw, index) => {
    const field = GROUP_HEADERS[normalize(raw)]
    if (field && map[field] === undefined) map[field] = index
  })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${GROUP_SHEET}'!A${GROUP_DATA_ROW}:Z`,
  })
  const rows = (res.data.values ?? []) as string[][]

  const cell = (row: string[], field: GroupField) => {
    const index = map[field]
    return index === undefined ? '' : String(row[index] ?? '').trim()
  }

  const items: ScheduleItem[] = []
  rows.forEach((row, i) => {
    const raw = cell(row, 'date')
    const parsed = parseDatetime(raw)
    if (!parsed) return

    const rowIndex = GROUP_DATA_ROW + i
    items.push({
      id: `group-${rowIndex}`,
      source: 'group',
      rowIndex,
      datetime: raw,
      date: parsed.date,
      time: parsed.time,
      type: typeFromText(cell(row, 'type')),
      title: cell(row, 'name'),
      capacity: Number(cell(row, 'capacity')) || 0,
      booked: Number(cell(row, 'booked')) || 0,
      master: cell(row, 'master'),
      eventId: cell(row, 'eventId'),
    })
  })

  return items
}

async function readReserved(spreadsheetId: string): Promise<ScheduleItem[]> {
  const sheets = getSheetsClient()
  let rows: string[][] = []
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${RESERVED_SHEET}'!A${RESERVED_DATA_ROW}:E`,
    })
    rows = (res.data.values ?? []) as string[][]
  } catch {
    return [] // аркуша ще немає — не критично
  }

  const items: ScheduleItem[] = []
  rows.forEach((row, i) => {
    const parsed = parseDatetime(String(row[0] ?? ''))
    if (!parsed) return

    const rowIndex = RESERVED_DATA_ROW + i
    items.push({
      id: `reserved-${rowIndex}`,
      source: 'reserved',
      rowIndex,
      datetime: String(row[0] ?? '').trim(),
      date: parsed.date,
      time: parsed.time,
      type: typeFromText(String(row[1] ?? '')),
      title: String(row[2] ?? '').trim(),
      capacity: 0,
      booked: 0,
      master: String(row[3] ?? '').trim(),
      eventId: '',
    })
  })

  return items
}

export async function getSchedule(
  studioId: string,
  { past = false }: { past?: boolean } = {},
): Promise<ScheduleItem[]> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const [group, reserved] = await Promise.all([
    readGroupSlots(spreadsheetId),
    readReserved(spreadsheetId),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const boundary = today.getTime()

  // Групові слоти з «Резерв часу» дублюються — їх уже видно з Group MKs
  const groupKeys = new Set(group.map((item) => `${item.date} ${item.time}`))
  const merged = [
    ...group,
    ...reserved.filter((item) => item.type !== 'group' || !groupKeys.has(`${item.date} ${item.time}`)),
  ]

  return merged
    .filter((item) => {
      const time = new Date(item.date).getTime()
      return past ? time < boundary : time >= boundary
    })
    .sort((a, b) => past
      ? `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
      : `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}

export async function assignMaster(
  studioId: string,
  item: { source: 'group' | 'reserved'; rowIndex: number },
  master: string,
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const sheets = getSheetsClient()

  if (item.source === 'reserved') {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${RESERVED_SHEET}'!D${item.rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[master]] },
    })
    return
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${GROUP_SHEET}'!A${GROUP_HEADER_ROW}:Z${GROUP_HEADER_ROW}`,
  })
  const header = (headerRes.data.values?.[0] ?? []) as string[]
  const index = header.findIndex((raw) => normalize(raw) === 'майстриня')
  if (index === -1) throw new Error('В аркуші Group MKs немає колонки «Майстриня»')

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${GROUP_SHEET}'!${columnLetter(index)}${item.rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[master]] },
  })
}

export interface NewScheduleEntry {
  type: MkType
  title: string
  capacity: number
  date: string // YYYY-MM-DD
  time: string // HH:MM
}

function toSheetDatetime(date: string, time: string): string {
  const [y, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}/${y} ${time}:00`
}

// Груповий іде в «Group MKs» (звідти його бере сайт) і в «Резерв часу».
// Дитячий та індивідуальний — тільки в «Резерв часу».
export async function addScheduleEntry(
  studioId: string,
  entry: NewScheduleEntry,
): Promise<void> {
  const spreadsheetId = getSpreadsheetId(studioId)
  const sheets = getSheetsClient()
  const datetime = toSheetDatetime(entry.date, entry.time)

  if (entry.type === 'group') {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${GROUP_SHEET}'!A${GROUP_DATA_ROW}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[datetime, entry.capacity, '', '', entry.title]] },
    })
  }

  const typeLabel = { group: 'Груповий', kids: 'Дитячий', indiv: 'Індивідуальний' }[entry.type]
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${RESERVED_SHEET}'!A${RESERVED_DATA_ROW}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[datetime, typeLabel, entry.title, '', '']] },
  })
}
