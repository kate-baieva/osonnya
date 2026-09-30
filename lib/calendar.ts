import { google } from 'googleapis'
import type { MkType } from './schedule'

// Події в Google Календарі створює сам застосунок.
// Сервісному акаунту тут квота не потрібна (подія — не файл), достатньо,
// щоб календар був розшарений на нього з правом змінювати події.

const TIMEZONE = 'Europe/Kyiv'

// Тривалості зі слів студії. Індивідуальний залежить від кількості:
// парний іде як груповий, а від трьох учасників — довший.
const GROUP_MINUTES = 150
const PAIR_MINUTES = 150
const INDIVIDUAL_MINUTES = 180
const KIDS_MINUTES = 90

function durationFor(input: CalendarEventInput): number {
  if (input.type === 'kids') return KIDS_MINUTES
  if (input.type === 'indiv') {
    const people = input.capacity || input.booked
    return people >= 3 ? INDIVIDUAL_MINUTES : PAIR_MINUTES
  }
  return GROUP_MINUTES
}

const CALENDAR_IDS: Record<string, string | undefined> = {
  sumy: process.env.CALENDAR_ID_SUMY,
  if: process.env.CALENDAR_ID_IF,
}

const TYPE_LABEL: Record<MkType, string> = {
  group: 'Груповий МК',
  indiv: 'Індивідуальний МК',
  kids: 'Дитячий МК',
}

function getCalendar() {
  const raw = process.env.GOOGLE_CREDENTIALS ?? ''
  if (!raw) throw new Error('GOOGLE_CREDENTIALS не налаштований')
  return google.calendar({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    }),
  })
}

export function calendarConfigured(studioId: string): boolean {
  return Boolean(CALENDAR_IDS[studioId])
}

export interface CalendarEventInput {
  type: MkType
  title: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  capacity: number
  booked: number
  master: string
  durationMinutes?: number
}

// Підпис у тому ж вигляді, до якого звикли в календарі
function summaryFor(input: CalendarEventInput): string {
  if (input.type === 'kids') return input.title?.trim() || 'Група для дітей'
  if (input.type === 'indiv') {
    return `Individual MK for ${input.capacity || input.booked} people`
  }
  return `Group MK, ${input.booked}/${input.capacity} Signups`
}

function buildEvent(input: CalendarEventInput) {
  const duration = input.durationMinutes ?? durationFor(input)
  const start = new Date(`${input.date}T${input.time}:00`)
  const end = new Date(start.getTime() + duration * 60000)
  const iso = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  const summary = summaryFor(input)
  const lines: string[] = []
  if (input.title?.trim() && input.type !== 'kids') lines.push(input.title.trim())
  if (input.capacity > 0) lines.push(`Записів: ${input.booked} з ${input.capacity}`)
  lines.push(`Майстриня: ${input.master || 'не призначено'}`)

  return {
    summary,
    description: lines.join('\n'),
    start: { dateTime: iso(start), timeZone: TIMEZONE },
    end: { dateTime: iso(end), timeZone: TIMEZONE },
  }
}

// Створює подію або оновлює наявну. Повертає id події.
// У таблиці id події записаний як iCalUID — з хвостом «@google.com».
// API приймає лише частину до собаки, інакше події почнуть двоїтися.
function normalizeEventId(value: string): string {
  return String(value ?? '').trim().split('@')[0]
}

export async function upsertEvent(
  studioId: string,
  input: CalendarEventInput,
  rawEventId?: string,
): Promise<string | null> {
  const calendarId = CALENDAR_IDS[studioId]
  if (!calendarId) return null

  const calendar = getCalendar()
  const requestBody = buildEvent(input)
  const eventId = rawEventId ? normalizeEventId(rawEventId) : ''

  if (eventId) {
    try {
      const res = await calendar.events.update({ calendarId, eventId, requestBody })
      return res.data.id ?? eventId
    } catch (error) {
      // Подію могли видалити вручну — тоді створюємо наново
      console.warn('[calendar] подію не оновлено, створюю нову:', (error as Error).message)
    }
  }

  const created = await calendar.events.insert({ calendarId, requestBody })
  return created.data.id ?? null
}

export async function deleteEvent(studioId: string, rawEventId: string): Promise<void> {
  const calendarId = CALENDAR_IDS[studioId]
  const eventId = normalizeEventId(rawEventId)
  if (!calendarId || !eventId) return

  try {
    await getCalendar().events.delete({ calendarId, eventId })
  } catch (error) {
    console.warn('[calendar] подію не видалено:', (error as Error).message)
  }
}
