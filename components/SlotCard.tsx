'use client'

import type { Slot } from '@/types'
import styles from './SlotCard.module.css'

const DURATION_MINUTES = 150 // 2.5 години

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

interface Props {
  slot: Slot
  selected: boolean
  onSelect: (id: string) => void
}

export default function SlotCard({ slot, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={() => onSelect(slot.id)}
      aria-pressed={selected}
    >
      {slot.title && <div className={styles.title}>{slot.title}</div>}
      <div className={styles.date}>{formatDate(slot.date)}</div>
      <div className={styles.time}>
        {slot.time} – {addMinutes(slot.time, DURATION_MINUTES)}
      </div>
      <div className={styles.spots}>
        {slot.spotsRemaining === 1
          ? 'Залишилось 1 місце'
          : `Вільних місць: ${slot.spotsRemaining}`}
      </div>
    </button>
  )
}
