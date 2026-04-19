'use client'

import type { Slot } from '@/types'
import styles from './SlotCard.module.css'

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
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
      <div className={styles.date}>{formatDate(slot.date)}</div>
      <div className={styles.time}>{slot.time}</div>
      {slot.title && <div className={styles.title}>{slot.title}</div>}
      <div className={styles.spots}>
        {slot.spotsRemaining === 1
          ? 'Залишилось 1 місце'
          : `Вільних місць: ${slot.spotsRemaining}`}
      </div>
      {slot.price && (
        <div className={styles.price}>{slot.price} грн</div>
      )}
    </button>
  )
}
