'use client'

import { STUDIOS } from '@/lib/studios'
import ui from './ui.module.css'

const LIST = [STUDIOS.sumy, STUDIOS.if]

export default function StudioSwitch({
  value,
  onChange,
}: {
  value: string
  onChange: (studioId: string) => void
}) {
  return (
    <div className={ui.segmented}>
      {LIST.map((studio) => (
        <button
          key={studio.id}
          type="button"
          className={`${ui.segment} ${value === studio.id ? ui.segmentActive : ''}`}
          onClick={() => onChange(studio.id)}
        >
          {studio.city}
        </button>
      ))}
    </div>
  )
}
