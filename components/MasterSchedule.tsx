'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MkType, ScheduleItem } from '@/lib/schedule'
import ui from './ui.module.css'
import styles from './MasterSchedule.module.css'

const TAG: Record<MkType, { label: string; className: string }> = {
  group: { label: 'груповий', className: styles.tagGroup },
  indiv: { label: 'індивідуальний', className: styles.tagIndiv },
  kids: { label: 'дитячий', className: styles.tagKids },
}

const FALLBACK: Record<MkType, string> = {
  group: 'Груповий майстер-клас',
  indiv: 'Індивідуальний майстер-клас',
  kids: 'Дитяча група',
}

const DAY_NAMES = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд']

function normalize(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function toDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Понеділок тижня, в який потрапляє дата
function weekStart(d: Date): Date {
  const start = new Date(d)
  const shift = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - shift)
  start.setHours(0, 0, 0, 0)
  return start
}

function formatDay(date: string): string {
  return toDate(date).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function MasterSchedule({ masterName }: { masterName: string }) {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'week'>('list')
  const [onlyMine, setOnlyMine] = useState(true)
  const [monday, setMonday] = useState(() => weekStart(new Date()))

  useEffect(() => {
    fetch('/api/schedule')
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) { setError(json.error ?? 'Не вдалося завантажити розклад'); return }
        setItems(json as ScheduleItem[])
      })
      .catch(() => setError("Немає з'єднання"))
      .finally(() => setLoading(false))
  }, [])

  const mine = useMemo(
    () => items.filter((item) => normalize(item.master) === normalize(masterName)),
    [items, masterName],
  )

  // Якщо жоден майстер-клас не підписаний на неї, показувати порожньо — знущання:
  // ймовірно, імена в таблиці й у доступі просто трохи різні
  const nothingAssigned = mine.length === 0 && items.length > 0
  const visible = onlyMine && !nothingAssigned ? mine : items

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const key = isoDate(date)
      return { date, key, items: visible.filter((item) => item.date === key) }
    })
  }, [monday, visible])

  const today = isoDate(new Date())

  const isMine = (item: ScheduleItem) => normalize(item.master) === normalize(masterName)

  return (
    <section style={{ marginBottom: 26 }}>
      <div className={styles.head}>
        <h2 className={ui.cardTitle} style={{ fontSize: 18 }}>Майстер-класи</h2>
        <div className={styles.controls}>
          <button
            className={`${ui.chip} ${onlyMine ? ui.chipActive : ''}`}
            onClick={() => setOnlyMine(true)}
          >Мої</button>
          <button
            className={`${ui.chip} ${!onlyMine ? ui.chipActive : ''}`}
            onClick={() => setOnlyMine(false)}
          >Усі</button>
          <span style={{ width: 8 }} />
          <button
            className={`${ui.chip} ${view === 'list' ? ui.chipActive : ''}`}
            onClick={() => setView('list')}
          >Список</button>
          <button
            className={`${ui.chip} ${view === 'week' ? ui.chipActive : ''}`}
            onClick={() => setView('week')}
          >Тиждень</button>
        </div>
      </div>

      {error && <p className={ui.error}>{error}</p>}
      {loading && <p className={styles.empty}>Завантаження…</p>}

      {!loading && nothingAssigned && onlyMine && (
        <div className={ui.hint} style={{ marginTop: 0, marginBottom: 12 }}>
          <b>На тебе поки нічого не призначено</b>
          Показуємо весь розклад студії. Якщо майстер-класи мали бути твої — скажи
          адміністратору, щоб призначила їх у розкладі.
        </div>
      )}

      {!loading && visible.length === 0 && !error && (
        <p className={styles.empty}>Попереду майстер-класів немає</p>
      )}

      {!loading && visible.length > 0 && view === 'list' && (
        <div className={styles.list}>
          {visible.map((item) => (
            <a
              key={item.id}
              href={`/master/mk?at=${encodeURIComponent(`${item.date} ${item.time}`)}`}
              className={`${styles.card} ${isMine(item) ? styles.cardMine : ''}`}
            >
              <span className={styles.when}>
                <span className={styles.day}>{formatDay(item.date)}</span>
                <span className={styles.time}>{item.time}</span>
              </span>
              <span className={styles.body}>
                <span className={styles.titleRow}>
                  <span className={styles.name}>{item.title || FALLBACK[item.type]}</span>
                  <span className={`${styles.tag} ${TAG[item.type].className}`}>{TAG[item.type].label}</span>
                  {isMine(item) && <span className={`${styles.tag} ${styles.tagMine}`}>твій</span>}
                </span>
                <span className={styles.meta}>
                  {item.capacity > 0
                    ? `${item.booked} з ${item.capacity} записів`
                    : 'без записів'}
                  {item.master && !isMine(item) ? ` · веде ${item.master}` : ''}
                </span>
              </span>
              <span className={styles.open}>Відкрити →</span>
            </a>
          ))}
        </div>
      )}

      {!loading && view === 'week' && (
        <>
          <div className={styles.weekNav}>
            <button
              className={styles.navBtn}
              onClick={() => setMonday((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n })}
            >‹</button>
            <button
              className={styles.navBtn}
              onClick={() => setMonday((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n })}
            >›</button>
            <span className={styles.weekLabel}>
              {days[0].date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
              {' — '}
              {days[6].date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
            </span>
            <button
              className={ui.chip}
              onClick={() => setMonday(weekStart(new Date()))}
            >Цей тиждень</button>
          </div>

          <div className={styles.grid}>
            {days.map((day, i) => (
              <div
                key={day.key}
                className={`${styles.dayCell} ${day.key === today ? styles.dayToday : ''}`
                  + (day.items.length === 0 ? ` ${styles.dayEmpty} ${styles.dayCellEmptyHidden}` : '')}
              >
                <div className={styles.dayHead}>
                  <span className={styles.dayName}>{DAY_NAMES[i]}</span>
                  <span className={styles.dayNum}>{day.date.getDate()}</span>
                </div>
                <div className={styles.dayItems}>
                  {day.items.map((item) => (
                    <a
                      key={item.id}
                      href={`/master/mk?at=${encodeURIComponent(`${item.date} ${item.time}`)}`}
                      className={`${styles.chip} ${isMine(item) ? styles.chipMine : ''}`}
                    >
                      <span className={styles.chipTime}>{item.time}</span>
                      {item.title || FALLBACK[item.type]}
                      {item.capacity > 0 ? ` · ${item.booked}/${item.capacity}` : ''}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
