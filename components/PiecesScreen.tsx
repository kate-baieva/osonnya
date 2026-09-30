'use client'

import { useEffect, useMemo, useState } from 'react'
import { DEFECT_STATUSES, PIECE_STATUSES, type Piece, type PieceStatus } from '@/lib/piece-types'
import { STUDIOS } from '@/lib/studios'
import styles from './PiecesScreen.module.css'

const STUDIO_LIST = [STUDIOS.sumy, STUDIOS.if]

// Старші за чотири місяці йдуть в архів, щоб робочий список лишався коротким
const ARCHIVE_AFTER_DAYS = 120

// В архіві понад тисяча виробів — малювати їх усі важко для телефона.
// Показуємо частину, а решту знаходять пошуком.
const ARCHIVE_PAGE = 100

type FilterId = 'raw' | 'bisque' | 'glazing' | 'ready' | 'problem' | 'given' | 'all'

const FILTERS: { id: FilterId; label: string; statuses: string[] | null }[] = [
  { id: 'raw',     label: 'Невипалені',   statuses: ['Невипалений'] },
  { id: 'bisque',  label: 'Утіль',         statuses: ['Утіль'] },
  { id: 'glazing', label: 'Глазурується',  statuses: ['Глазурується'] },
  { id: 'ready',   label: 'Готово',        statuses: ['Готово'] },
  { id: 'problem', label: 'Проблемні',     statuses: DEFECT_STATUSES },
  { id: 'given',   label: 'Забрали',       statuses: ['Забрали'] },
  { id: 'all',     label: 'Усі',           statuses: null },
]

const BADGE_CLASS: Record<string, string> = {
  'Невипалений': styles.badgeRaw,
  'Утіль': styles.badgeBisque,
  'Глазурується': styles.badgeGlazing,
  'Готово': styles.badgeReady,
  'Забрали': styles.badgeGiven,
  'Брак': styles.badgeDefect,
  'Частковий брак': styles.badgeDefect,
}

// У таблиці лежить посилання на Drive — застосунок віддає файл через власний проксі
function photoSrc(value: string): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/\/d\/([A-Za-z0-9_-]{20,})/) ?? text.match(/[?&]id=([A-Za-z0-9_-]{20,})/)
  const id = match ? match[1] : (/^[A-Za-z0-9_-]{20,}$/.test(text) ? text : null)
  return id ? `/api/photo/${id}` : null
}

// Дати в таблиці — "2/16/2025 16:30:00" або ISO
function parseSheetDate(raw: string): number {
  if (!raw) return 0
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (mdy) {
    const [, month, day, year, hour, minute] = mdy
    return new Date(
      Number(year), Number(month) - 1, Number(day),
      Number(hour ?? 0), Number(minute ?? 0),
    ).getTime()
  }
  const parsed = new Date(raw.replace(' ', 'T')).getTime()
  return isNaN(parsed) ? 0 : parsed
}

function formatDate(raw: string): string {
  const time = parseSheetDate(raw)
  if (!time) return raw
  return new Date(time).toLocaleDateString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function daysSince(raw: string): number | null {
  const time = parseSheetDate(raw)
  if (!time) return null
  return Math.floor((Date.now() - time) / 86400000)
}

export default function PiecesScreen({
  studio: initialStudio,
  canSwitchStudio,
  mode = 'work',
}: {
  studio: string
  canSwitchStudio: boolean
  mode?: 'work' | 'archive'
}) {
  const archive = mode === 'archive'
  const [studio, setStudio] = useState(initialStudio)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filter, setFilter] = useState<FilterId>(mode === 'archive' ? 'all' : 'raw')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [targetStatus, setTargetStatus] = useState<PieceStatus>('Утіль')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<number | null>(null)
  const [detail, setDetail] = useState<Piece | null>(null)

  const load = useMemo(() => async (studioId: string) => {
    setLoading(true)
    setError('')
    setSelected(new Set())
    try {
      const res = await fetch(`/api/pieces?studio=${studioId}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Не вдалося завантажити вироби')
        setPieces([])
        return
      }
      setPieces(json as Piece[])
    } catch {
      setError("Немає з'єднання")
      setPieces([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(studio) }, [studio, load])

  // Вироби без дати лишаємо в роботі: викидати в архів те, про що нічого
  // не відомо, — найкоротший шлях їх загубити
  const scoped = useMemo(() => {
    const cutoff = Date.now() - ARCHIVE_AFTER_DAYS * 86400000
    return pieces.filter((piece) => {
      const time = parseSheetDate(piece.mkDate)
      if (!time) return !archive
      return archive ? time < cutoff : time >= cutoff
    })
  }, [pieces, archive])

  const counts = useMemo(() => {
    const result: Record<FilterId, number> = {
      raw: 0, bisque: 0, glazing: 0, ready: 0, problem: 0, given: 0, all: scoped.length,
    }
    for (const filterDef of FILTERS) {
      if (!filterDef.statuses) continue
      result[filterDef.id] = scoped.filter((p) => filterDef.statuses!.includes(p.status)).length
    }
    return result
  }, [scoped])

  const visible = useMemo(() => {
    const filterDef = FILTERS.find((f) => f.id === filter)!
    const needle = query.trim().toLowerCase()

    return scoped
      .filter((piece) => !filterDef.statuses || filterDef.statuses.includes(piece.status))
      .filter((piece) => {
        if (!needle) return true
        return piece.number.toLowerCase().includes(needle)
          || piece.client.toLowerCase().includes(needle)
      })
      // В роботі найстаріші зверху — випалюються вони першими.
      // В архіві навпаки: шукають зазвичай щось недавнє.
      .sort((a, b) => archive
        ? parseSheetDate(b.mkDate) - parseSheetDate(a.mkDate)
        : parseSheetDate(a.mkDate) - parseSheetDate(b.mkDate))
  }, [scoped, filter, query])

  // Обмежуємо лише архів: у роботі виробів і так небагато
  const shown = archive && !query.trim() ? visible.slice(0, ARCHIVE_PAGE) : visible

  const toggle = (rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  const selectAllVisible = () => setSelected(new Set(shown.map((p) => p.rowIndex)))
  const clearSelection = () => setSelected(new Set())

  const uploadPhoto = async (piece: Piece, file: File) => {
    setUploading(piece.rowIndex)
    setError('')
    try {
      const form = new FormData()
      form.append('studio', studio)
      form.append('rowIndex', String(piece.rowIndex))
      form.append('photo', file)
      const res = await fetch('/api/pieces/photo', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося зберегти фото'); return }
      await load(studio)
    } catch {
      setError("Немає з'єднання. Фото не збережено.")
    } finally {
      setUploading(null)
    }
  }

  const needsComment = DEFECT_STATUSES.includes(targetStatus)

  const apply = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/pieces/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studio,
          rowIndexes: Array.from(selected),
          status: targetStatus,
          comment: needsComment && comment.trim() ? comment.trim() : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Не вдалося зберегти зміни')
        return
      }
      setComment('')
      await load(studio)
    } catch {
      setError("Немає з'єднання. Зміни не збережено.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.wrap}>
      {detail && (
        <PieceCard
          piece={detail}
          studio={studio}
          onClose={() => setDetail(null)}
        />
      )}
      {canSwitchStudio && (
        <div className={styles.studioTabs}>
          {STUDIO_LIST.map((s) => (
            <button
              key={s.id}
              className={`${styles.studioTab} ${studio === s.id ? styles.studioTabActive : ''}`}
              onClick={() => setStudio(s.id)}
            >
              {s.city}
            </button>
          ))}
        </div>
      )}

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`${styles.filter} ${filter === f.id ? styles.filterActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className={styles.filterCount}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <input
        className={styles.search}
        placeholder="Пошук за номером або іменем"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <p className={styles.error}>{error}</p>}

      {!loading && visible.length > 0 && (
        <div className={styles.selectBar}>
          <span>
            {shown.length < visible.length
              ? `Показано ${shown.length} з ${visible.length} — знайдіть потрібний пошуком`
              : `Показано ${visible.length}`}
          </span>
          <button className={styles.linkBtn} onClick={selected.size ? clearSelection : selectAllVisible}>
            {selected.size ? 'Зняти виділення' : 'Обрати всі'}
          </button>
        </div>
      )}

      {loading && <p className={styles.empty}>Завантаження…</p>}
      {!loading && visible.length === 0 && !error && (
        <p className={styles.empty}>Тут порожньо</p>
      )}

      <div className={styles.list}>
        {shown.map((piece) => {
          const isSelected = selected.has(piece.rowIndex)
          const age = daysSince(piece.mkDate)
          return (
            <div
              key={piece.rowIndex}
              className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
              onClick={() => setDetail(piece)}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isSelected}
                onChange={() => toggle(piece.rowIndex)}
                onClick={(e) => e.stopPropagation()}
              />

              <label
                className={styles.thumbWrap}
                onClick={(e) => e.stopPropagation()}
                title={photoSrc(piece.photoUrl) ? 'Замінити фото' : 'Сфотографувати виріб'}
              >
                {uploading === piece.rowIndex ? (
                  <span className={styles.thumbEmpty}>…</span>
                ) : photoSrc(piece.photoUrl) ? (
                  <img src={photoSrc(piece.photoUrl)!} alt="" className={styles.thumb} />
                ) : (
                  <span className={styles.thumbEmpty}>+</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className={styles.fileInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadPhoto(piece, file)
                    e.target.value = ''
                  }}
                />
              </label>

              <div className={styles.info}>
                <span className={styles.number}>№ {piece.number}</span>
                <span className={styles.client}>{piece.client || '—'}</span>
                <span className={styles.meta}>
                  {formatDate(piece.mkDate)}
                  {age !== null && age >= 0 && ` · ${age} дн.`}
                  {piece.master && ` · ${piece.master}`}
                </span>
                {piece.comment && <span className={styles.comment}>{piece.comment}</span>}
              </div>

              <div>
                <span className={`${styles.badge} ${BADGE_CLASS[piece.status] ?? ''}`}>
                  {piece.status || 'без статусу'}
                </span>
                {piece.communication && (
                  <div className={styles.notified}>{piece.communication}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selected.size > 0 && (
        <div className={styles.actionBar}>
          <div className={styles.actionInner}>
            <div className={styles.actionRow}>
              <span className={styles.actionCount}>Обрано {selected.size}</span>
              <select
                className={styles.select}
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as PieceStatus)}
              >
                {PIECE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <button className={styles.apply} onClick={apply} disabled={saving}>
                {saving ? 'Зберігаємо…' : 'Змінити'}
              </button>
            </div>

            {needsComment && (
              <input
                className={styles.commentInput}
                placeholder="Що сталося з виробом"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface LogEntry {
  when: string
  event: string
  status: string
  who: string
  comment: string
}

function PieceCard({
  piece,
  studio,
  onClose,
}: {
  piece: Piece
  studio: string
  onClose: () => void
}) {
  const [history, setHistory] = useState<LogEntry[] | null>(null)
  const [zoom, setZoom] = useState(false)
  const src = photoSrc(piece.photoUrl)

  useEffect(() => {
    fetch(`/api/pieces/log?studio=${studio}&number=${encodeURIComponent(piece.number)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => setHistory(Array.isArray(json) ? json : []))
      .catch(() => setHistory([]))
  }, [studio, piece.number])

  return (
    <div className={styles.cardWrap} onClick={onClose}>
      <div className={styles.cardBody} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Виріб № {piece.number}</h3>
          <button className={styles.cardClose} onClick={onClose}>×</button>
        </div>

        {src && (
          <img
            src={src}
            alt=""
            className={zoom ? styles.cardPhotoBig : styles.cardPhoto}
            onClick={() => setZoom((v) => !v)}
            title={zoom ? 'Зменшити' : 'Збільшити'}
          />
        )}

        <div className={styles.cardFacts}>
          <span className={styles.cardKey}>Клієнт</span><span>{piece.client || '—'}</span>
          <span className={styles.cardKey}>Дата МК</span><span>{formatDate(piece.mkDate)}</span>
          <span className={styles.cardKey}>Майстриня</span><span>{piece.master || '—'}</span>
          <span className={styles.cardKey}>Статус</span>
          <span><span className={`${styles.badge} ${BADGE_CLASS[piece.status] ?? ''}`}>{piece.status}</span></span>
          {piece.communication && (
            <>
              <span className={styles.cardKey}>Клієнта</span><span>{piece.communication}</span>
            </>
          )}
          {piece.comment && (
            <>
              <span className={styles.cardKey}>Коментар</span><span>{piece.comment}</span>
            </>
          )}
        </div>

        <h4 className={styles.cardSubtitle}>Історія змін</h4>

        {history === null && <p className={styles.empty}>Завантаження…</p>}
        {history?.length === 0 && (
          <p className={styles.empty}>
            Записів ще немає. Історія ведеться з моменту, коли застосунок почав
            фіксувати зміни — те, що міняли в таблиці руками, сюди не потрапило.
          </p>
        )}

        {history && history.length > 0 && (
          <div className={styles.timeline}>
            {history.map((entry, i) => (
              <div key={i} className={styles.tlItem}>
                <span className={styles.tlDot} />
                <div className={styles.tlBody}>
                  <span className={styles.tlWhat}>{entry.event}</span>
                  <span className={styles.tlWhen}>{entry.when} · {entry.who}</span>
                  {entry.comment && <span className={styles.tlComment}>{entry.comment}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
