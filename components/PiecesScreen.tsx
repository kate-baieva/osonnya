'use client'

import { useEffect, useMemo, useState } from 'react'
import { DEFECT_STATUSES, PIECE_STATUSES, type Piece, type PieceStatus } from '@/lib/piece-types'
import { STUDIOS } from '@/lib/studios'
import styles from './PiecesScreen.module.css'

const STUDIO_LIST = [STUDIOS.sumy, STUDIOS.if]

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
}: {
  studio: string
  canSwitchStudio: boolean
}) {
  const [studio, setStudio] = useState(initialStudio)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filter, setFilter] = useState<FilterId>('raw')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [targetStatus, setTargetStatus] = useState<PieceStatus>('Утіль')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

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

  const counts = useMemo(() => {
    const result: Record<FilterId, number> = {
      raw: 0, bisque: 0, glazing: 0, ready: 0, problem: 0, given: 0, all: pieces.length,
    }
    for (const filterDef of FILTERS) {
      if (!filterDef.statuses) continue
      result[filterDef.id] = pieces.filter((p) => filterDef.statuses!.includes(p.status)).length
    }
    return result
  }, [pieces])

  const visible = useMemo(() => {
    const filterDef = FILTERS.find((f) => f.id === filter)!
    const needle = query.trim().toLowerCase()

    return pieces
      .filter((piece) => !filterDef.statuses || filterDef.statuses.includes(piece.status))
      .filter((piece) => {
        if (!needle) return true
        return piece.number.toLowerCase().includes(needle)
          || piece.client.toLowerCase().includes(needle)
      })
      // Найстаріші зверху — випалюються вони першими
      .sort((a, b) => parseSheetDate(a.mkDate) - parseSheetDate(b.mkDate))
  }, [pieces, filter, query])

  const toggle = (rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  const selectAllVisible = () => setSelected(new Set(visible.map((p) => p.rowIndex)))
  const clearSelection = () => setSelected(new Set())

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
          <span>Показано {visible.length}</span>
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
        {visible.map((piece) => {
          const isSelected = selected.has(piece.rowIndex)
          const age = daysSince(piece.mkDate)
          return (
            <div
              key={piece.rowIndex}
              className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
              onClick={() => toggle(piece.rowIndex)}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isSelected}
                onChange={() => toggle(piece.rowIndex)}
                onClick={(e) => e.stopPropagation()}
              />

              {piece.photoUrl ? (
                <img src={piece.photoUrl} alt="" className={styles.thumb} />
              ) : (
                <div className={styles.thumbEmpty}>🏺</div>
              )}

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
