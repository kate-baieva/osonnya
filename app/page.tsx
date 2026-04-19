'use client'

import { useEffect, useState } from 'react'
import type { Slot } from '@/types'
import SlotList from '@/components/SlotList'
import RegistrationForm from '@/components/RegistrationForm'
import styles from './page.module.css'

export default function HomePage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/slots')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSlots(data)
        else setError('Не вдалося завантажити розклад')
      })
      .catch(() => setError('Немає з\'єднання. Перевірте інтернет і перезавантажте сторінку.'))
      .finally(() => setLoading(false))
  }, [])

  const selectedSlot = slots.find((s) => s.id === selectedId) ?? null

  const handleSuccess = () => {
    setSuccess(true)
    setSelectedId(null)
    // Refresh slots to reflect updated capacity
    fetch('/api/slots')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSlots(data) })
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Запис на майстер-клас</h1>
        <p className={styles.subtitle}>
          Оберіть зручний час і заповніть форму — ми отримаємо ваш запис автоматично
        </p>
      </header>

      {success ? (
        <div className={styles.successBox}>
          <div className={styles.successIcon}>✓</div>
          <h2>Дякуємо!</h2>
          <p>Ваш запис прийнято. Ми зв'яжемося з вами для підтвердження.</p>
          <button
            className={styles.resetBtn}
            onClick={() => setSuccess(false)}
          >
            Записати ще когось
          </button>
        </div>
      ) : (
        <div className={styles.layout}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Оберіть дату і час</h2>
            {loading && <p className={styles.loading}>Завантаження розкладу…</p>}
            {error && <p className={styles.errorText}>{error}</p>}
            {!loading && !error && (
              <SlotList
                slots={slots}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Ваші дані</h2>
            <RegistrationForm
              selectedSlot={selectedSlot}
              onSuccess={handleSuccess}
            />
          </section>
        </div>
      )}
    </main>
  )
}
