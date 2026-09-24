'use client'

import { useEffect, useState } from 'react'
import type { IndividualPrice } from '@/lib/google-sheets'
import { STUDIOS } from '@/lib/studios'
import CopyButton from '../CopyButton'
import StudioSwitch from '../StudioSwitch'
import ui from '../ui.module.css'

export default function CertificateForm() {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const [studioId, setStudioId] = useState('sumy')
  const [prices, setPrices] = useState<IndividualPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [groupCount, setGroupCount] = useState(1)
  const [link, setLink] = useState<string | null>(null)

  const studio = STUDIOS[studioId]

  useEffect(() => {
    setLoading(true)
    setSelectedIdx(0)
    setGroupCount(1)
    setLink(null)
    fetch(`/api/mk-prices?studio=${studioId}`)
      .then((r) => r.json())
      .then((data: IndividualPrice[]) => { if (Array.isArray(data)) setPrices(data) })
      .finally(() => setLoading(false))
  }, [studioId])

  const selected = prices[selectedIdx]
  const isGroup = selected?.label.toLowerCase().includes('груповий') ?? false
  const unitPrice = selected ? (selected.priceWeekend ?? selected.priceWeekday) : 0
  const totalPrice = isGroup ? unitPrice * groupCount : unitPrice
  const displayCount = isGroup ? groupCount : (selected?.peopleCount ?? 1)

  const generate = () => {
    if (!selected || !origin) return
    const payload = {
      studio: studioId,
      mkLabel: selected.label,
      peopleCount: displayCount,
      price: totalPrice,
    }
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    setLink(`${origin}${studio.basePath}/certificate?d=${encoded}`)
  }

  return (
    <>
      <StudioSwitch value={studioId} onChange={(id) => { setStudioId(id); setLink(null) }} />

      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Посилання для продажу онлайн</h2>
        <p className={ui.cardDesc}>
          Клієнт сам заповнить дані й обере — електронний чи паперовий сертифікат
        </p>

        {loading ? (
          <p className={ui.empty}>Завантаження цін…</p>
        ) : (
          <>
            <div className={ui.formGrid}>
              <div className={`${ui.field} ${ui.fieldWide}`}>
                <label className={ui.label}>Формат майстер-класу</label>
                <select
                  className={ui.selectInput}
                  value={selectedIdx}
                  onChange={(e) => { setSelectedIdx(Number(e.target.value)); setGroupCount(1); setLink(null) }}
                >
                  {prices.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                </select>
              </div>

              {selected && (
                <div className={`${ui.field} ${ui.fieldWide}`}>
                  <label className={ui.label}>Кількість учасників</label>
                  {isGroup ? (
                    <div className={ui.stepper}>
                      <button
                        type="button" className={ui.stepBtn} disabled={groupCount <= 1}
                        onClick={() => { setGroupCount((n) => Math.max(1, n - 1)); setLink(null) }}
                      >−</button>
                      <span className={ui.stepVal}>{groupCount}</span>
                      <button
                        type="button" className={ui.stepBtn}
                        onClick={() => { setGroupCount((n) => n + 1); setLink(null) }}
                      >+</button>
                    </div>
                  ) : (
                    <span className={ui.sub}>{displayCount} — задано форматом</span>
                  )}
                </div>
              )}
            </div>

            {selected && (
              <div className={ui.summary}>
                <span className={ui.summaryLabel}>
                  Вартість
                  {isGroup && groupCount > 1 && ` · ${groupCount} × ${unitPrice.toLocaleString('uk-UA')}`}
                </span>
                <span className={ui.summaryValue}>{totalPrice.toLocaleString('uk-UA')} грн</span>
              </div>
            )}

            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!selected}
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
