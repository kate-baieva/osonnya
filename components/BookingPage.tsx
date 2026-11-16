'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Slot } from '@/types'
import { STUDIOS, type StudioInfo } from '@/lib/studios'
import SlotList from '@/components/SlotList'
import RegistrationForm from '@/components/RegistrationForm'
import styles from '@/app/page.module.css'
import LegalLinks from './LegalLinks'

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Стан готівкового посилання: поки його не перевірив сервер, форми немає
type CashState =
  | { state: 'loading' }
  | { state: 'ok'; slot: Slot; max: number }
  | { state: 'used' }
  | { state: 'gone' }
  | { state: 'invalid' }

interface Props {
  studioId: string
}

export default function BookingPage({ studioId }: Props) {
  const studio: StudioInfo = STUDIOS[studioId] ?? STUDIOS.sumy
  const searchParams = useSearchParams()
  const preselectedId = searchParams.get('slot')
  const cashToken = searchParams.get('cash')

  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId)
  const [success, setSuccess] = useState(false)
  const [cashDue, setCashDue] = useState(0)
  const [cash, setCash] = useState<CashState>({ state: 'loading' })

  // Готівкове посилання живе за своїми правилами: воно одноразове, тож
  // придатність перевіряє сервер, а не розклад
  useEffect(() => {
    if (!cashToken) return
    setLoading(false)
    fetch(`/api/cash-link?d=${encodeURIComponent(cashToken)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.state === 'ok') setCash({ state: 'ok', slot: data.slot, max: data.max })
        else if (data?.state === 'used') setCash({ state: 'used' })
        else if (data?.state === 'gone') setCash({ state: 'gone' })
        else setCash({ state: 'invalid' })
      })
      .catch(() => setError('Немає з\'єднання. Перевірте інтернет і перезавантажте сторінку.'))
  }, [cashToken])

  useEffect(() => {
    if (cashToken) return
    fetch(`/api/slots?studio=${studioId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSlots(data)
        else setError('Не вдалося завантажити розклад')
      })
      .catch(() => setError('Немає з\'єднання. Перевірте інтернет і перезавантажте сторінку.'))
      .finally(() => setLoading(false))
  }, [studioId, cashToken])

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

  const handleCashSuccess = (amount: number) => {
    setCashDue(amount)
    setSuccess(true)
  }

  // ─── Запис із оплатою готівкою ──────────────────────────────────────────
  if (cashToken) {
    const slot = cash.state === 'ok' ? cash.slot : null

    return (
      <main className={styles.main}>
        <header className={styles.header}>
          <img src="/logo.svg" alt="Osonnya" className={styles.logo} />

          {!success && slot && (
            <>
              <h1 className={styles.heading}>
                {slot.title
                  ? `Запис на «${slot.title}» в ${studio.cityLocative}`
                  : `Запис на майстер-клас в ${studio.cityLocative}`}
              </h1>
              <p className={styles.subtitle}>
                {formatDate(slot.date)} о {slot.time}
              </p>

              <div className={styles.cashBanner}>
                <p className={styles.cashBannerTitle}>Оплата готівкою в студії</p>
                <p className={styles.cashBannerText}>
                  Це особисте посилання для оплати готівкою. Заповніть форму — місце
                  буде за вами, а оплатите на місці перед початком майстер-класу.
                </p>
              </div>

              <div className={styles.includes}>
                <p className={styles.includesIntro}>У вартість майстер-класу входить:</p>
                <ul className={styles.includesList}>
                  <li>2,5 години майстер-клас</li>
                  <li>створення власного виробу до 25 см, або двох виробів до 10 см</li>
                  <li>декорування виробу ангобами (фарбами)</li>
                  <li>випали виробу у пічці з глазуруванням</li>
                </ul>
              </div>
            </>
          )}
        </header>

        {error && <p className={styles.errorText}>{error}</p>}

        {!error && cash.state === 'loading' && (
          <p className={styles.loading}>Перевіряємо посилання…</p>
        )}

        {/* Використане й прострочене посилання кажуть те саме: далі — в дірект */}
        {!error && (cash.state === 'used' || cash.state === 'gone' || cash.state === 'invalid') && (
          <div className={styles.successBox}>
            <h2 className={styles.successHeading}>
              {cash.state === 'used'
                ? 'Це посилання вже використане'
                : 'Це посилання більше не діє'}
            </h2>
            <p className={styles.successLocation}>
              {cash.state === 'used'
                ? 'За ним уже є запис на майстер-клас.'
                : 'Майстер-клас уже минув або на ньому не лишилось місць.'}
              {' '}Якщо треба записатись або щось змінити — напишіть нам, будь ласка,
              в дірект інстаграму {studio.instagramHandle}, і ми все зробимо.
            </p>
            <a
              href={studio.instagramHighlightsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.igLink}
            >
              Написати в Instagram →
            </a>
          </div>
        )}

        {success ? (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.successHeading}>
              Дякуємо за реєстрацію на майстер-клас!<br />
              Із нетерпінням чекаємо на вас в Осонні
            </h2>

            <div className={styles.payBox}>
              <p className={styles.payBoxTitle}>Оплата готівкою в студії</p>
              <p className={styles.payBoxSum}>{cashDue.toLocaleString('uk-UA')} грн</p>
              <p className={styles.payBoxText}>
                Просимо оплатити готівкою перед початком майстер-класу.
              </p>
            </div>

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
          </div>
        ) : cash.state === 'ok' && (
          <div className={styles.layout}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Ваші дані</h2>
              <RegistrationForm
                selectedSlot={cash.slot}
                studioId={studioId}
                pricePerPerson={studio.pricePerPerson}
                onSuccess={handleSuccess}
                cashToken={cashToken}
                maxPeople={cash.max}
                onCashSuccess={handleCashSuccess}
                onCashLinkUsed={() => setCash({ state: 'used' })}
              />
            </section>
          </div>
        )}

        <LegalLinks />
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        {preselectedId ? (
          <>
            <h1 className={styles.heading}>
              {visibleSlots[0]?.title
                ? `Запис на «${visibleSlots[0].title}» в ${studio.cityLocative}`
                : `Запис на майстер-клас в ${studio.cityLocative}`}
            </h1>
            {visibleSlots[0] && (
              <p className={styles.subtitle}>
                {formatDate(visibleSlots[0].date)} о {visibleSlots[0].time}
              </p>
            )}
            <div className={styles.includes}>
              <p className={styles.includesIntro}>
                Будемо раді бачити вас на майстер-класі з ліплення з глини в Осонні.
                У вартість майстер-класу входить:
              </p>
              <ul className={styles.includesList}>
                <li>2,5 години майстер-клас</li>
                <li>створення власного виробу до 25 см, або двох виробів до 10 см</li>
                <li>декорування виробу ангобами (фарбами)</li>
                <li>випали виробу у пічці з глазуруванням</li>
              </ul>
            </div>
          </>
        ) : (
          <>
            <h1 className={styles.heading}>Запис на майстер-клас із ліплення з глини в {studio.cityLocative}</h1>
            <p className={styles.subtitle}>
              Раді вітати вас в Осонні! Оберіть зручний день та час майстер-класу.
              Після заповнення форми вас перенаправить на оплату.
            </p>
            <div className={styles.includes}>
              <p className={styles.includesIntro}>У вартість майстер-класу входить:</p>
              <ul className={styles.includesList}>
                <li>2,5 години майстер-клас</li>
                <li>створення власного виробу до 25 см, або двох виробів до 10 см</li>
                <li>декорування виробу ангобами (фарбами)</li>
                <li>випали виробу у пічці з глазуруванням</li>
              </ul>
            </div>
            <p className={styles.disclaimer}>
              Ми повернемо вам кошти у випадку завчасної відміни запису (до 18:00 за день
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

      <LegalLinks />
    </main>
  )
}
