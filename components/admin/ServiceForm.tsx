'use client'

import { useState } from 'react'
import { CATEGORIES } from '@/lib/service-categories'
import CopyButton from '../CopyButton'
import StudioSwitch from '../StudioSwitch'
import ui from '../ui.module.css'

// Посилання робить сервер: воно підписане, а SESSION_SECRET у браузері
// немає й бути не повинно
export default function ServiceForm() {
  const [studioId, setStudioId] = useState('sumy')
  const [category, setCategory] = useState<string>(CATEGORIES[0].value)
  const [comment, setComment] = useState('')
  const [amount, setAmount] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setLink(null); setError('') }

  const amountNumber = Math.round(Number(amount.replace(/\s/g, '').replace(',', '.')))
  const canCreate = Boolean(comment.trim()) && Number.isFinite(amountNumber) && amountNumber > 0

  const create = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/services/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio: studioId, category, comment: comment.trim(), amount: amountNumber }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося створити посилання'); return }
      setLink(json.url)
      try { await navigator.clipboard.writeText(json.url) } catch { /* скопіює кнопкою */ }
    } catch {
      setError("Немає з'єднання")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StudioSwitch value={studioId} onChange={(id) => { setStudioId(id); reset() }} />

      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Додати відвідувача</h2>
        <p className={ui.cardDesc}>
          Оплата того, що не прив&apos;язане до майстер-класу: коворкінг, випал,
          дитяче заняття, покупка в студії
        </p>

        <div className={ui.formGrid}>
          <div className={ui.field}>
            <label className={ui.label}>Категорія</label>
            <select
              className={ui.selectInput}
              value={category}
              onChange={(e) => { setCategory(e.target.value); reset() }}
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <span className={ui.fieldNote}>
              Потрапить у колонку «Category» — за нею рахується звітність
            </span>
          </div>

          <div className={ui.field}>
            <label className={ui.label}>Що саме за послуга</label>
            <input
              className={ui.input}
              value={comment}
              maxLength={200}
              placeholder="коворкінг 3 години, глина своя"
              onChange={(e) => { setComment(e.target.value); reset() }}
            />
            <span className={ui.fieldNote}>Це побачить клієнт на сторінці оплати</span>
          </div>

          <div className={ui.field}>
            <label className={ui.label}>Сума, грн</label>
            <input
              className={ui.input}
              value={amount}
              inputMode="numeric"
              placeholder="700"
              onChange={(e) => { setAmount(e.target.value); reset() }}
            />
          </div>
        </div>

        {error && <p className={ui.error}>{error}</p>}

        {!link && (
          <button
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={!canCreate || saving}
            onClick={create}
          >
            {saving ? 'Створюємо…' : 'Скопіювати посилання'}
          </button>
        )}

        {link && (
          <div className={ui.resultBox}>
            <p className={ui.resultLabel}>Посилання для клієнта — вже у буфері обміну:</p>
            <div className={ui.linkRow}>
              <span className={ui.linkText}>{link}</span>
              <CopyButton text={link} />
            </div>
            <div className={ui.rowActions}>
              <button
                className={`${ui.btn} ${ui.btnSmall}`}
                onClick={() => { setComment(''); setAmount(''); reset() }}
              >
                Додати ще одного
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
