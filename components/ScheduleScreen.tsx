'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MkType, ScheduleItem } from '@/lib/schedule'
import { STUDIOS } from '@/lib/studios'
import CopyButton from './CopyButton'
import StudioSwitch from './StudioSwitch'
import ui from './ui.module.css'
import styles from './ScheduleScreen.module.css'

const FILTERS: { id: 'all' | MkType; label: string }[] = [
  { id: 'all', label: 'Усі' },
  { id: 'group', label: 'Групові' },
  { id: 'indiv', label: 'Індивідуальні' },
  { id: 'kids', label: 'Дитячі' },
]

const TAG = {
  group: { label: 'груповий', className: styles.tagGroup },
  indiv: { label: 'індивідуальний', className: styles.tagIndiv },
  kids: { label: 'дитячий', className: styles.tagKids },
}

// В архіві сотні майстер-класів — малювати всі важко, решту знаходять пошуком
const ARCHIVE_PAGE = 60

const FALLBACK_TITLE = {
  group: 'Груповий майстер-клас',
  indiv: 'Індивідуальний майстер-клас',
  kids: 'Дитяча група',
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('uk-UA', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export default function ScheduleScreen({ past = false }: { past?: boolean }) {
  const [studioId, setStudioId] = useState('sumy')
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [masters, setMasters] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | MkType>('all')
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState('')

  useEffect(() => setOrigin(window.location.origin), [])

  const load = useCallback(async (studio: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/schedule?studio=${studio}${past ? '&past=1' : ''}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося завантажити розклад'); setItems([]); return }
      setItems(json as ScheduleItem[])
    } catch {
      setError("Немає з'єднання")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [past])

  useEffect(() => { load(studioId) }, [studioId, load])

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((json) => {
        if (!Array.isArray(json)) return
        setMasters(json
          .filter((u: { role: string; studio: string | null; active: boolean }) =>
            u.role === 'master' && u.active && u.studio === studioId)
          .map((u: { name: string; login: string }) => u.name || u.login))
      })
      .catch(() => setMasters([]))
  }, [studioId])

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: items.length, group: 0, indiv: 0, kids: 0 }
    items.forEach((item) => { result[item.type]++ })
    return result
  }, [items])

  const byType = filter === 'all' ? items : items.filter((item) => item.type === filter)

  const needle = query.trim().toLowerCase()
  const matched = needle
    ? byType.filter((item) =>
        item.title.toLowerCase().includes(needle)
        || item.date.includes(needle)
        || (item.master ?? '').toLowerCase().includes(needle))
    : byType

  const visible = past && !needle ? matched.slice(0, ARCHIVE_PAGE) : matched

  const assign = async (item: ScheduleItem, master: string) => {
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, master } : x)))
    const res = await fetch('/api/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studio: studioId, source: item.source, rowIndex: item.rowIndex, master }),
    })
    if (!res.ok) {
      setError('Не вдалося зберегти майстриню')
      load(studioId)
    }
  }

  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>{past ? 'Архів майстер-класів' : 'Розклад'}</h1>
          <p className={ui.sub}>
            {past
              ? 'Усе, що вже відбулося.'
              : 'Майстер-класи, що попереду. Тут же — хто веде і посилання для запису.'}
          </p>
        </div>
        {!past && (
          <div className={ui.rowActions}>
            <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setAdding(true)}>
              + Додати майстер-клас
            </button>
            <a className={ui.btn} href="/admin/archive">Архів майстер-класів</a>
          </div>
        )}
      </div>

      <StudioSwitch value={studioId} onChange={setStudioId} />

      <div className={ui.chips}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`${ui.chip} ${filter === f.id ? ui.chipActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}<span className={ui.chipCount}>{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {past && (
        <input
          className={ui.input}
          style={{ marginBottom: 14 }}
          placeholder="Пошук за назвою, майстринею або датою (2026-09)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {past && !loading && matched.length > visible.length && (
        <p className={ui.sub} style={{ marginBottom: 10 }}>
          Показано {visible.length} з {matched.length} — знайдіть потрібний пошуком
        </p>
      )}

      {error && <p className={ui.error}>{error}</p>}
      {loading && <p className={ui.empty}>Завантаження…</p>}
      {!loading && visible.length === 0 && !error && (
        <p className={ui.empty}>Тут порожньо</p>
      )}

      <div className={styles.list}>
        {visible.map((item) => {
          const full = item.capacity > 0 && item.booked >= item.capacity
          const percent = item.capacity > 0 ? Math.round(item.booked / item.capacity * 100) : 0
          const bookingLink = `${origin}${STUDIOS[studioId]?.basePath ?? ''}?slot=${encodeURIComponent(item.eventId || item.id)}`

          return (
            <article key={item.id} className={styles.card}>
              <div className={styles.when}>
                <span className={styles.day}>{formatDay(item.date)}</span>
                <span className={styles.time}>{item.time}</span>
              </div>

              <div className={styles.body}>
                <div className={styles.titleRow}>
                  <span className={styles.name}>{item.title || FALLBACK_TITLE[item.type]}</span>
                  <span className={`${styles.tag} ${TAG[item.type].className}`}>{TAG[item.type].label}</span>
                </div>

                <div className={styles.meta}>
                  {item.source === 'reserved' || item.capacity === 0 ? (
                    <span className={styles.reserved}>місце в розкладі, без записів</span>
                  ) : (
                    <span className={styles.seats}>
                      <span className={styles.seatBar}>
                        <span
                          className={`${styles.seatFill} ${full ? styles.seatFull : ''}`}
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className={styles.seatNum}>{item.booked} з {item.capacity}</span>
                    </span>
                  )}

                  <span className={styles.masterPick}>
                    <span className={styles.masterLabel}>веде</span>
                    <select
                      className={`${styles.masterSelect} ${item.master ? '' : styles.unassigned}`}
                      value={item.master}
                      onChange={(e) => assign(item, e.target.value)}
                    >
                      <option value="">не призначено</option>
                      {masters.map((name) => <option key={name} value={name}>{name}</option>)}
                      {item.master && !masters.includes(item.master) && (
                        <option value={item.master}>{item.master}</option>
                      )}
                    </select>
                  </span>
                </div>
              </div>

              <div className={styles.side}>
                {item.type === 'group' && !past && (
                  full
                    ? <span className={`${ui.btn} ${ui.btnSmall} ${ui.btnFull}`}>Місць немає</span>
                    : <CopyButton text={bookingLink} label="Копіювати посилання" className={`${ui.btn} ${ui.btnSmall}`} />
                )}
                {item.type !== 'kids' && (
                  <a
                    className={`${ui.btn} ${ui.btnSmall}`}
                    href={`/admin/mk?studio=${studioId}&at=${encodeURIComponent(`${item.date} ${item.time}`)}`}
                  >Відкрити</a>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {adding && (
        <AddMkDialog
          studioId={studioId}
          onClose={() => setAdding(false)}
          onCreated={(createdStudio) => {
            setAdding(false)
            if (createdStudio !== studioId) setStudioId(createdStudio)
            else load(studioId)
          }}
        />
      )}
    </>
  )
}

const TYPE_TEXT: Record<MkType, { label: string; note: string; placeholder: string; where: string }> = {
  group: {
    label: 'Назва майстер-класу',
    note: 'Саме цю назву побачить клієнт у формі запису',
    placeholder: 'Майстер-клас на вільну тему',
    where: 'Рядок піде в аркуш «Group MKs» — звідти його бере сайт запису — і копія в «Резерв часу».',
  },
  kids: {
    label: 'Назва (необовʼязково)',
    note: 'Записів немає — це просто заброньований час',
    placeholder: 'Дитяча група',
    where: 'Тільки в «Резерв часу». На сайті запису не зʼявиться.',
  },
  indiv: {
    label: 'Назва (необовʼязково)',
    note: 'Якщо порожньо — підпишемо за типом',
    placeholder: 'Індивідуальний МК',
    where: 'Тільки в «Резерв часу». Щоб клієнт міг записатись, зробіть посилання в розділі «Індивідуальний МК».',
  },
}

function AddMkDialog({
  studioId,
  onClose,
  onCreated,
}: {
  studioId: string
  onClose: () => void
  onCreated: (studioId: string) => void
}) {
  const [type, setType] = useState<MkType>('group')
  const [title, setTitle] = useState('')
  const [capacity, setCapacity] = useState(7)
  const [target, setTarget] = useState(studioId)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('12:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const text = TYPE_TEXT[type]

  const submit = async () => {
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio: target, type, title, capacity, date, time }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося додати'); return }
      onCreated(target)
    } catch {
      setError("Немає з'єднання")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalWrap}>
      <div className={styles.modalBack} onClick={onClose} />
      <div className={styles.modalCard}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Додати майстер-клас</h3>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>

        <div className={ui.segmented} style={{ marginTop: 12 }}>
          {(['group', 'kids', 'indiv'] as MkType[]).map((id) => (
            <button
              key={id}
              className={`${ui.segment} ${type === id ? ui.segmentActive : ''}`}
              onClick={() => setType(id)}
            >
              {{ group: 'Груповий', kids: 'Дитячий', indiv: 'Індивідуальний' }[id]}
            </button>
          ))}
        </div>

        <div className={ui.formGrid}>
          <div className={`${ui.field} ${ui.fieldWide}`}>
            <label className={ui.label}>{text.label}</label>
            <input
              className={ui.input} placeholder={text.placeholder}
              value={title} onChange={(e) => setTitle(e.target.value)}
            />
            <span className={ui.fieldNote}>{text.note}</span>
          </div>

          {type !== 'kids' && (
            <div className={ui.field}>
              <label className={ui.label}>Максимум учасників</label>
              <div className={ui.stepper}>
                <button className={ui.stepBtn} onClick={() => setCapacity((n) => Math.max(1, n - 1))}>−</button>
                <span className={ui.stepVal}>{capacity}</span>
                <button className={ui.stepBtn} onClick={() => setCapacity((n) => n + 1)}>+</button>
              </div>
            </div>
          )}

          <div className={ui.field}>
            <label className={ui.label}>Студія</label>
            <select className={ui.selectInput} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="sumy">{STUDIOS.sumy.city}</option>
              <option value="if">{STUDIOS.if.city}</option>
            </select>
          </div>

          <div className={ui.field}>
            <label className={ui.label}>Дата</label>
            <input className={ui.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Час</label>
            <input className={ui.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className={ui.hint}><b>Куди потрапить</b>{text.where}</div>
        {error && <p className={ui.error} style={{ marginTop: 12 }}>{error}</p>}

        <div className={styles.modalFoot}>
          <button className={ui.btn} onClick={onClose}>Скасувати</button>
          <button className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving || !date} onClick={submit}>
            {saving ? 'Додаємо…' : 'Додати в розклад'}
          </button>
        </div>
      </div>
    </div>
  )
}
