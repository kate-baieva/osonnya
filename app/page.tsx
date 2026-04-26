'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Slot } from '@/types'
import SlotList from '@/components/SlotList'
import RegistrationForm from '@/components/RegistrationForm'
import styles from './page.module.css'

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function HomeContent() {
  const searchParams = useSearchParams()
  const preselectedId = searchParams.get('slot')

  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId)
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

  // Якщо є ?slot=ID — показуємо лише цей слот
  const visibleSlots = preselectedId
    ? slots.filter((s) => s.id === preselectedId)
    : slots

  const selectedSlot = slots.find((s) => s.id === selectedId) ?? null

  const handleSuccess = () => {
    setSuccess(true)
    setSelectedId(null)
    fetch('/api/slots')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSlots(data) })
  }

  // Заголовок залежить від режиму
  const subtitle = preselectedId && visibleSlots[0]
    ? [visibleSlots[0].title, `${formatDate(visibleSlots[0].date)} о ${visibleSlots[0].time}`].filter(Boolean).join(' · ')
    : 'Оберіть зручний час і заповніть форму — ми отримаємо ваш запис автоматично'

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <p className={styles.subtitle}>{subtitle}</p>
      </header>

      {success ? (
        <div className={styles.successBox}>
          <div className={styles.successIcon}>✓</div>
          <h2>Дякуємо!</h2>
          <p>Ваш запис прийнято. Ми зв'яжемося з вами для підтвердження.</p>
          <button className={styles.resetBtn} onClick={() => setSuccess(false)}>
            Записати ще когось
          </button>
        </div>
      ) : (
        <div className={styles.layout}>
          {!preselectedId && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>1. Оберіть дату і час</h2>
              {loading && <p className={styles.loading}>Завантаження розкладу…</p>}
              {error && <p className={styles.errorText}>{error}</p>}
              {!loading && !error && (
                <SlotList slots={visibleSlots} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </section>
          )}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {preselectedId ? 'Ваші дані' : '2. Ваші дані'}
            </h2>
            {loading && preselectedId && <p className={styles.loading}>Завантаження…</p>}
            {!loading && preselectedId && visibleSlots.length === 0 && (
              <p className={styles.errorText}>Цей майстер-клас вже недоступний або заповнений.</p>
            )}
            {!loading && (!preselectedId || visibleSlots.length > 0) && (
              <RegistrationForm
                selectedSlot={preselectedId ? (visibleSlots[0] ?? null) : selectedSlot}
                onSuccess={handleSuccess}
              />
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  )
}
