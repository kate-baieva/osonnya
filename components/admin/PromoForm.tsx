'use client'

import { useState } from 'react'
import CopyButton from '../CopyButton'
import StudioSwitch from '../StudioSwitch'
import ui from '../ui.module.css'

const PROMO_TYPES = [
  { value: 'group', label: 'Груповий МК' },
  { value: 'individual', label: 'Індивідуальний МК' },
  { value: 'any', label: 'Будь-який МК' },
]

export default function PromoForm() {
  const [studioId, setStudioId] = useState('sumy')
  const [contact, setContact] = useState('')
  const [discount, setDiscount] = useState(10)
  const [mkType, setMkType] = useState('any')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ code: string; discount: number } | null>(null)

  const generate = async () => {
    if (!contact.trim()) { setError('Вкажіть контакт'); return }
    if (discount <= 0 || discount > 100) { setError('Знижка має бути від 1 до 100%'); return }

    setError('')
    setCreating(true)
    setCreated(null)
    try {
      const res = await fetch('/api/create-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio: studioId, contact: contact.trim(), discountPercent: discount, mkType }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Помилка. Спробуйте ще раз.'); return }
      setCreated({ code: json.code, discount: json.discountPercent })
    } catch {
      setError("Немає з'єднання. Спробуйте ще раз.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <StudioSwitch value={studioId} onChange={(id) => { setStudioId(id); setCreated(null) }} />

      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Створити промокод</h2>
        <p className={ui.cardDesc}>Разова знижка. Термін дії — 3 місяці, заповнюється автоматично.</p>

        <div className={ui.formGrid}>
          <div className={`${ui.field} ${ui.fieldWide}`}>
            <label className={ui.label}>Контакт (кому видано)</label>
            <input
              className={ui.input}
              placeholder="Ім'я, Instagram або телефон"
              value={contact}
              onChange={(e) => { setContact(e.target.value); setCreated(null) }}
            />
          </div>

          <div className={ui.field}>
            <label className={ui.label}>Знижка, %</label>
            <input
              className={ui.input} type="number" min={1} max={100} value={discount}
              onChange={(e) => { setDiscount(Number(e.target.value)); setCreated(null) }}
            />
          </div>

          <div className={ui.field}>
            <label className={ui.label}>Діє на</label>
            <select
              className={ui.selectInput} value={mkType}
              onChange={(e) => { setMkType(e.target.value); setCreated(null) }}
            >
              {PROMO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {error && <p className={ui.error} style={{ marginTop: 14 }}>{error}</p>}

        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          style={{ marginTop: 15 }}
          disabled={creating}
          onClick={generate}
        >
          {creating ? 'Створюємо…' : 'Створити промокод'}
        </button>

        {created && (
          <div className={ui.resultBox}>
            <p className={ui.resultLabel}>Промокод зі знижкою {created.discount}% — надішліть клієнту:</p>
            <div className={ui.linkRow}>
              <span className={`${ui.linkText} ${ui.codeText}`}>{created.code}</span>
              <CopyButton text={created.code} />
            </div>
          </div>
        )}
      </section>
    </>
  )
}
