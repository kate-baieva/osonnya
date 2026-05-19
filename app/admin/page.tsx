'use client'

import { useEffect, useState } from 'react'
import type { Slot } from '@/types'
import { STUDIOS, type StudioInfo } from '@/lib/studios'
import styles from './admin.module.css'

const STUDIO_LIST: StudioInfo[] = [STUDIOS.sumy, STUDIOS.if]

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('uk-UA', {
    weekday: 'short', day: 'numeric', month: 'long',
  })
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className={styles.copyBtn} onClick={copy}>
      {copied ? '✓ Скопійовано' : 'Копіювати'}
    </button>
  )
}

function StudioSection({ studio, origin }: { studio: StudioInfo; origin: string }) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/slots?studio=${studio.id}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSlots(data) })
      .finally(() => setLoading(false))
  }, [studio.id])

  const basePath = studio.basePath  // '/sumy' або '/if'
  const generalLink = `${origin}${basePath}`

  return (
    <div className={styles.studioBlock}>
      <h2 className={styles.studioTitle}>{studio.name}</h2>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Загальне посилання</h3>
        <p className={styles.cardDesc}>Усі доступні майстер-класи — клієнт обирає сам</p>
        <div className={styles.linkRow}>
          <span className={styles.link}>{generalLink}</span>
          <CopyButton text={generalLink} />
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Посилання на конкретний майстер-клас</h3>
        <p className={styles.cardDesc}>Клієнт одразу потрапляє на форму для обраного слоту</p>

        {loading && <p className={styles.empty}>Завантаження…</p>}
        {!loading && slots.length === 0 && (
          <p className={styles.empty}>Немає доступних слотів</p>
        )}

        <div className={styles.slotList}>
          {slots.map((slot) => {
            const url = `${origin}${basePath}?slot=${encodeURIComponent(slot.id)}`
            return (
              <div key={slot.id} className={styles.slotRow}>
                <div className={styles.slotInfo}>
                  {slot.title && <span className={styles.slotTitle}>{slot.title}</span>}
                  <span className={styles.slotDate}>{formatDate(slot.date)}</span>
                  <span className={styles.slotTime}>о {slot.time}</span>
                  <span className={styles.slotSpots}>
                    {slot.spotsRemaining} з {slot.capacity} місць
                  </span>
                </div>
                <div className={styles.linkRow}>
                  <span className={styles.link}>{url}</span>
                  <CopyButton text={url} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default function AdminPage() {
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
      <h1 className={styles.title}>Посилання для запису</h1>
      {origin && STUDIO_LIST.map((studio) => (
        <StudioSection key={studio.id} studio={studio} origin={origin} />
      ))}
    </main>
  )
}
