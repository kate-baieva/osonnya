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

// Проведених майстер-класів за всю історію — сотні. На головну одразу
// йдуть лише свіжі: саме їх дооформлюють після заняття. Решта — за кнопкою.
const RECENT_PAST_DAYS = 30

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

// Картка однакова для того, що попереду, і для проведеного — різниця лише
// в приглушених кольорах і позначці, щоб відкривати можна було так само
function MkCard({ item, mine, past }: { item: ScheduleItem; mine: boolean; past: boolean }) {
  return (
    <a
      href={`/master/mk?at=${encodeURIComponent(`${item.date} ${item.time}`)}`}
      className={`${styles.card} ${mine ? styles.cardMine : ''}`
        + (past ? ` ${styles.cardPast}` : '')}
    >
      <span className={styles.when}>
        <span className={styles.day}>{formatDay(item.date)}</span>
        <span className={styles.time}>{item.time}</span>
      </span>
      <span className={styles.body}>
        <span className={styles.titleRow}>
          <span className={styles.name}>{item.title || FALLBACK[item.type]}</span>
          <span className={`${styles.tag} ${TAG[item.type].className}`}>{TAG[item.type].label}</span>
          {past && <span className={`${styles.tag} ${styles.tagPast}`}>проведений</span>}
          {mine && <span className={`${styles.tag} ${styles.tagMine}`}>твій</span>}
        </span>
        <span className={styles.meta}>
          {item.capacity > 0
            ? `${item.booked} з ${item.capacity} записів`
            : 'без записів'}
          {item.master && !mine ? ` · веде ${item.master}` : ''}
        </span>
      </span>
      <span className={styles.open}>Відкрити →</span>
    </a>
  )
}

export default function MasterSchedule({ masterName }: { masterName: string }) {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [pastItems, setPastItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'week'>('list')
  const [onlyMine, setOnlyMine] = useState(true)
  const [showAllPast, setShowAllPast] = useState(false)
  const [monday, setMonday] = useState(() => weekStart(new Date()))

  useEffect(() => {
    const load = (url: string) =>
      fetch(url).then(async (r) => ({ ok: r.ok, json: await r.json() }))

    Promise.all([load('/api/schedule'), load('/api/schedule?past=1')])
      .then(([upcoming, past]) => {
        if (!upcoming.ok) {
          setError(upcoming.json?.error ?? 'Не вдалося завантажити розклад')
          return
        }
        setItems(upcoming.json as ScheduleItem[])
        // Проведені не критичні: якщо не завантажились, розклад попереду
        // все одно показуємо, а не падаємо весь блок
        if (past.ok && Array.isArray(past.json)) setPastItems(past.json as ScheduleItem[])
      })
      .catch(() => setError("Немає з'єднання"))
      .finally(() => setLoading(false))
  }, [])

  const isMine = (item: ScheduleItem) => normalize(item.master) === normalize(masterName)

  const mine = useMemo(() => items.filter(isMine), [items, masterName])
  const minePast = useMemo(() => pastItems.filter(isMine), [pastItems, masterName])

  // Якщо жоден майстер-клас не підписаний на неї, показувати порожньо — знущання:
  // ймовірно, імена в таблиці й у доступі просто трохи різні
  const nothingAssigned = mine.length === 0 && minePast.length === 0
    && items.length + pastItems.length > 0
  const showMine = onlyMine && !nothingAssigned

  const visible = showMine ? mine : items
  const pastAll = showMine ? minePast : pastItems

  // Проведені приходять із сервера найсвіжішими вперед — так і показуємо
  const recentCut = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - RECENT_PAST_DAYS)
    return isoDate(d)
  }, [])
  const pastRecent = useMemo(
    () => pastAll.filter((item) => item.date >= recentCut),
    [pastAll, recentCut],
  )
  const pastList = showAllPast ? pastAll : pastRecent
  const olderCount = pastAll.length - pastRecent.length

  // У тижневому перегляді межі задає сам тиждень, тож туда беремо все
  const weekPool = useMemo(() => [...visible, ...pastAll], [visible, pastAll])

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const key = isoDate(date)
      return { date, key, items: weekPool.filter((item) => item.date === key) }
    })
  }, [monday, weekPool])

  const today = isoDate(new Date())
  // Межа та сама, що й на сервері: майстер-клас сьогодні — ще не проведений
  const isPast = (item: ScheduleItem) => item.date < today

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

      {!loading && view === 'list' && visible.length === 0 && !error && (
        <p className={styles.empty}>Попереду майстер-класів немає</p>
      )}

      {!loading && view === 'list' && visible.length > 0 && (
        <div className={styles.list}>
          {visible.map((item) => (
            <MkCard key={item.id} item={item} mine={isMine(item)} past={false} />
          ))}
        </div>
      )}

      {!loading && view === 'list' && pastList.length > 0 && (
        <>
          <div className={styles.pastHead}>
            <span className={styles.pastTitle}>Проведені</span>
          </div>
          <div className={styles.list}>
            {pastList.map((item) => (
              <MkCard key={item.id} item={item} mine={isMine(item)} past />
            ))}
          </div>
          {!showAllPast && olderCount > 0 && (
            <div className={styles.moreWrap}>
              <button className={ui.chip} onClick={() => setShowAllPast(true)}>
                Показати давніші ({olderCount})
              </button>
            </div>
          )}
        </>
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
                      className={`${styles.chip} ${isMine(item) ? styles.chipMine : ''}`
                        + (isPast(item) ? ` ${styles.chipPast}` : '')}
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
