'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Slot } from '@/types'
import { STUDIOS, type StudioInfo } from '@/lib/studios'
import SlotList from '@/components/SlotList'
import RegistrationForm from '@/components/RegistrationForm'
import styles from '@/app/page.module.css'

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

interface Props {
  studioId: string
}

export default function BookingPage({ studioId }: Props) {
  const studio: StudioInfo = STUDIOS[studioId] ?? STUDIOS.sumy
  const searchParams = useSearchParams()
  const preselectedId = searchParams.get('slot')

  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch(`/api/slots?studio=${studioId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSlots(data)
        else setError('Не вдалося завантажити розклад')
      })
      .catch(() => setError('Немає з\'єднання. Перевірте інтернет і перезавантажте сторінку.'))
      .finally(() => setLoading(false))
  }, [studioId])

  const visibleSlots = preselectedId
    ? slots.filter((s) => s.id === preselectedId)
    : slots

  const selectedSlot = slots.find((s) => s.id === selectedId) ?? null

  const handleSuccess = () => {
    setSuccess(true)
    setSelectedId(null)
    fetch(`/api/slots?studio=${studioId}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSlots(data) })
  }

  const subtitle = preselectedId && visibleSlots[0]
    ? [visibleSlots[0].title, `${formatDate(visibleSlots[0].date)} о ${visibleSlots[0].time}`].filter(Boolean).join(' · ')
    : null

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        {subtitle ? (
          <p className={styles.subtitle}>{subtitle}</p>
        ) : (
          <>
            <h1 className={styles.heading}>Запис на майстер-клас із ліплення з глини</h1>
            <p className={styles.subtitle}>
              Раді вітати вас в Осонні! Оберіть зручний день та час майстер-класу.
              Після заповнення форми вас перенаправить на сторінку внесення передоплати.
            </p>
            <p className={styles.disclaimer}>
              Ми повернемо вам передоплату у випадку завчасної відміни запису (до 18:00 за день
              до майстер-класу), або у випадку форс-мажорів. Для уточнення зверніться, будь ласка,
              в дірект інстаграму {studio.instagramHandle}.
            </p>
          </>
        )}
      </header>

      {success ? (
        <div className={styles.successBox}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successHeading}>
            Дякуємо за реєстрацію на майстер-клас!<br />
            Із нетерпінням чекаємо на вас в Осонні
          </h2>
          <p className={styles.successAddress}>
            Студія «Осоння» знаходиться за адресою:<br />
            <strong>місто {studio.city}, {studio.address}</strong>
          </p>
          <p className={styles.successLocation}>
            У збережених історіях «Локація» на нашій сторінці в інстаграм ви знайдете більше
            деталей, як знайти вхід до студії.
          </p>
          <a
            href={studio.instagramHighlightsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.igLink}
          >
            Відкрити локацію в Instagram →
          </a>
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
                studioId={studioId}
                pricePerPerson={studio.pricePerPerson}
                onSuccess={handleSuccess}
              />
            )}
          </section>
        </div>
      )}
    </main>
  )
}
