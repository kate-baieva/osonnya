'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ui from './ui.module.css'

export default function ProfileScreen({
  name,
  login,
  roleLabel,
}: {
  name: string
  login: string
  roleLabel: string
}) {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setError('')
    if (next !== repeat) { setError('Новий пароль і повтор не збігаються'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося зберегти'); return }
      router.replace('/login')
      router.refresh()
    } catch {
      setError("Немає з'єднання. Спробуйте ще раз.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Змінити пароль</h2>
        <p className={ui.cardDesc}>Після зміни доведеться увійти знову</p>

        <div className={ui.formGrid}>
          <div className={`${ui.field} ${ui.fieldWide}`}>
            <label className={ui.label}>Поточний пароль</label>
            <input
              className={ui.input} type="password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Новий пароль</label>
            <input
              className={ui.input} type="password" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)}
            />
            <span className={ui.fieldNote}>Не коротший за 8 символів</span>
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Повторіть новий</label>
            <input
              className={ui.input} type="password" autoComplete="new-password"
              value={repeat} onChange={(e) => setRepeat(e.target.value)}
            />
          </div>
        </div>

        {error && <p className={ui.error} style={{ marginTop: 14 }}>{error}</p>}

        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          style={{ marginTop: 15 }}
          disabled={saving || !current || !next}
          onClick={save}
        >
          {saving ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </section>

      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Обліковий запис</h2>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <tbody>
              <tr><td style={{ color: '#9b8878' }}>Ім&apos;я</td><td>{name}</td></tr>
              <tr><td style={{ color: '#9b8878' }}>Логін</td><td>{login}</td></tr>
              <tr><td style={{ color: '#9b8878' }}>Роль</td><td>{roleLabel}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
