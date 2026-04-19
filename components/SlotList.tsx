'use client'

import type { Slot } from '@/types'
import SlotCard from './SlotCard'
import styles from './SlotList.module.css'

interface Props {
  slots: Slot[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function SlotList({ slots, selectedId, onSelect }: Props) {
  if (slots.length === 0) {
    return (
      <p className={styles.empty}>
        Наразі немає доступних майстер-класів. Заходьте пізніше!
      </p>
    )
  }

  return (
    <div className={styles.grid}>
      {slots.map((slot) => (
        <SlotCard
          key={slot.id}
          slot={slot}
          selected={selectedId === slot.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
