'use client'

import { useCallback, useEffect, useState } from 'react'
import type { IndividualPrice } from '@/lib/google-sheets'
import { STUDIOS } from '@/lib/studios'
import CopyButton from '../CopyButton'
import StudioSwitch from '../StudioSwitch'
import ui from '../ui.module.css'

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return day === 0 || day === 6
}

function formatDateLabel(value: string): string {
  if (!value) return ''
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function IndividualForm() {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const today = new Date().toISOString().split('T')[0]

  const [studioId, setStudioId] = useState('sumy')
  const [prices, setPrices] = useState<IndividualPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [peopleCount, setPeopleCount] = useState(2)
  const [link, setLink] = useState<string | null>(null)

  const studio = STUDIOS[studioId]

  useEffect(() => {
    setLoading(true)
    setLink(null)
    fetch(`/api/individual-prices?studio=${studioId}`)
      .then((r) => r.json())
      .then((data: IndividualPrice[]) => {
        if (!Array.isArray(data)) return
        setPrices(data)
        if (data.length > 0) setPeopleCount(data[0].peopleCount)
      })
      .finally(() => setLoading(false))
  }, [studioId])

  const priceEntry = prices.find((p) => p.peopleCount === peopleCount)
  const weekend = date ? isWeekend(date) : false
  const totalPrice = priceEntry
    ? (weekend && priceEntry.priceWeekend != null ? priceEntry.priceWeekend : priceEntry.priceWeekday)
    : null

  const counts = prices.map((p) => p.peopleCount)
  const minCount = counts[0] ?? 2
  const maxCount = counts[counts.length - 1] ?? 10

  const changeCount = useCallback((delta: number) => {
    setPeopleCount((prev) => {
      const next = prev + delta
      if (counts.includes(next)) return next
      const sorted = [...counts].sort((a, b) => Math.abs(a - next) - Math.abs(b - next))
      return sorted[0] ?? prev
    })
    setLink(null)
  }, [counts])

  const generate = () => {
    if (!totalPrice) return
    const payload = { studio: studioId, date, time, peopleCount, totalPrice }
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    setLink(`${origin}${studio.basePath}/individual?d=${encoded}`)
  }

  const hasWeekendPrices = prices.some((p) => p.priceWeekend != null)
  const canGenerate = date.length > 0 && time.length > 0 && totalPrice !== null

  return (
    <>
      <StudioSwitch value={studioId} onChange={(id) => { setStudioId(id); setLink(null) }} />

      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Створити посилання для запису</h2>
        <p className={ui.cardDesc}>
          Вартість підтягується з таблиці цін — окремо для буднього дня і вихідного
        </p>

        {loading ? (
          <p className={ui.empty}>Завантаження цін…</p>
        ) : (
          <>
            <div className={ui.formGrid}>
              <div className={ui.field}>
                <label className={ui.label}>Дата</label>
                <input
                  className={ui.input} type="date" min={today} value={date}
                  onChange={(e) => { setDate(e.target.value); setLink(null) }}
                />
              </div>
              <div className={ui.field}>
                <label className={ui.label}>Час</label>
                <input
                  className={ui.input} type="time" value={time}
                  onChange={(e) => { setTime(e.target.value); setLink(null) }}
                />
              </div>

              <div className={`${ui.field} ${ui.fieldWide}`}>
                <label className={ui.label}>Кількість учасників</label>
                <div className={ui.stepper}>
                  <button
                    type="button" className={ui.stepBtn}
                    disabled={peopleCount <= minCount}
                    onClick={() => changeCount(-1)}
                  >−</button>
                  <span className={ui.stepVal}>{peopleCount}</span>
                  <button
                    type="button" className={ui.stepBtn}
                    disabled={peopleCount >= maxCount}
                    onClick={() => changeCount(1)}
                  >+</button>
                  {priceEntry && <span className={ui.sub}>{priceEntry.label}</span>}
                </div>
              </div>
            </div>

            <div className={ui.summary}>
              <span className={ui.summaryLabel}>
                Вартість
                {date && ` · ${formatDateLabel(date)}`}
                {date && hasWeekendPrices && (weekend ? ' · вихідний' : ' · будній день')}
              </span>
              <span className={ui.summaryValue}>
                {totalPrice !== null ? `${totalPrice.toLocaleString('uk-UA')} грн` : '—'}
              </span>
            </div>

            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!canGenerate}
              onClick={generate}
            >
              Згенерувати посилання
            </button>

            {link && (
              <div className={ui.resultBox}>
                <p className={ui.resultLabel}>Посилання для клієнта:</p>
                <div className={ui.linkRow}>
                  <span className={ui.linkText}>{link}</span>
                  <CopyButton text={link} />
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}
