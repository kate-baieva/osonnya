'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { STUDIOS } from '@/lib/studios'
import type { IndividualPrice } from '@/lib/google-sheets'
import styles from './IndividualBookingPage.module.css'

const PREPAYMENT = 700

// ─── Типи ────────────────────────────────────────────────

interface BookingParams {
  studio: string
  date: string     // YYYY-MM-DD
  time: string     // HH:MM
  peopleCount: number
  totalPrice: number
}

const formSchema = z.object({
  name:     z.string().min(2, 'Введіть ім\'я (мінімум 2 символи)').max(50),
  surname:  z.string().min(2, 'Введіть прізвище (мінімум 2 символи)').max(50),
  phone:    z.string().min(1, 'Введіть номер телефону')
              .regex(/^\+?3?8?0?\d{9}$|^0\d{9}$/, 'Введіть коректний номер (наприклад: 0501234567)'),
  instagram: z.string().min(1, 'Введіть нік або посилання на Instagram').max(100),
})
type FormInput = z.infer<typeof formSchema>

// ─── Helpers ─────────────────────────────────────────────

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return dow === 0 || dow === 6
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function decodeParams(raw: string): BookingParams | null {
  try {
    const json = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as BookingParams
  } catch {
    return null
  }
}

function getPrice(prices: IndividualPrice[], count: number, weekend: boolean): number | null {
  const entry = prices.find((p) => p.peopleCount === count)
  if (!entry) return null
  return (weekend && entry.priceWeekend != null) ? entry.priceWeekend : entry.priceWeekday
}

// ─── Компонент ───────────────────────────────────────────

export default function IndividualBookingPage({ studioId }: { studioId: string }) {
  const searchParams = useSearchParams()
  const studio = STUDIOS[studioId]

  const [params, setParams] = useState<BookingParams | null>(null)
  const [prices, setPrices] = useState<IndividualPrice[]>([])
  const [peopleCount, setPeopleCount] = useState(0)
  const [payMethod, setPayMethod] = useState<'card' | 'certificate'>('card')
  const [certCode, setCertCode] = useState('')
  const [certStatus, setCertStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [certError, setCertError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
  })

  // Розкодовуємо параметри з URL
  useEffect(() => {
    const d = searchParams.get('d')
    if (!d) return
    const decoded = decodeParams(d)
    if (decoded) {
      setParams(decoded)
      setPeopleCount(decoded.peopleCount)
    }
  }, [searchParams])

  // Завантажуємо ціни
  useEffect(() => {
    if (!studioId) return
    fetch(`/api/individual-prices?studio=${studioId}`)
      .then((r) => r.json())
      .then((data: IndividualPrice[]) => { if (Array.isArray(data)) setPrices(data) })
  }, [studioId])

  const weekend    = params ? isWeekend(params.date) : false
  const totalPrice = prices.length > 0 ? (getPrice(prices, peopleCount, weekend) ?? 0) : (params?.totalPrice ?? 0)
  const remainder  = Math.max(0, totalPrice - PREPAYMENT)

  const availableCounts = prices.map((p) => p.peopleCount)
  const minCount = availableCounts[0] ?? 2
  const maxCount = availableCounts[availableCounts.length - 1] ?? 10
  const priceEntry = prices.find((p) => p.peopleCount === peopleCount)

  const changeCount = useCallback((delta: number) => {
    setPeopleCount((prev) => {
      const next = prev + delta
      if (availableCounts.includes(next)) return next
      const sorted = [...availableCounts].sort((a, b) => Math.abs(a - next) - Math.abs(b - next))
      return sorted[0] ?? prev
    })
  }, [availableCounts])

  const checkCertificate = async () => {
    if (!certCode.trim()) return
    setCertStatus('checking')
    setCertError('')
    try {
      const res = await fetch('/api/validate-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: certCode.trim(), studio: studioId, mkType: 'individual' }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setCertStatus('invalid')
        setCertError(json.error ?? 'Помилка перевірки')
        return
      }
      if (!json.valid) {
        setCertStatus('invalid')
        setCertError(json.reason)
        return
      }
      if (json.peopleCount < peopleCount) {
        setCertStatus('invalid')
        setCertError(`Сертифікат розрахований на ${json.peopleCount} учасн., а ви вказали ${peopleCount}`)
        return
      }
      setCertStatus('valid')
    } catch {
      setCertStatus('invalid')
      setCertError('Немає з\'єднання. Спробуйте ще раз.')
    }
  }

  const onSubmit = async (data: FormInput) => {
    if (!params) return
    if (payMethod === 'certificate' && certStatus !== 'valid') {
      setServerError('Спочатку перевірте код сертифікату')
      return
    }
    setServerError('')
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        ...data,
        peopleCount,
        studio: studioId,
        date: params.date,
        time: params.time,
        totalPrice,
      }
      if (payMethod === 'certificate') body.certificateCode = certCode.trim()

      const res = await fetch('/api/register-individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()

      if (!res.ok) {
        setServerError(json.error ?? 'Сталася помилка. Спробуйте ще раз.')
        return
      }
      if (json.paymentUrl) {
        window.location.href = json.paymentUrl
        return
      }
      setSuccess(true)
    } catch {
      setServerError('Немає з\'єднання з інтернетом. Спробуйте ще раз.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Success ─────────────────────────────────────────────

  if (success) {
    return (
      <main className={styles.main}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <div className={styles.successCard}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.successHeading}>
            Дякуємо за реєстрацію!<br />Із нетерпінням чекаємо на вас в Осонні
          </h1>
          <p className={styles.successAddress}>
            {studio?.name} · {studio?.address}
          </p>
        </div>
      </main>
    )
  }

  // ─── Помилка розкодування ────────────────────────────────

  if (!params) {
    return (
      <main className={styles.main}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <p className={styles.errorMsg}>Посилання недійсне або застаріло. Зверніться до студії.</p>
      </main>
    )
  }

  const hasWeekendPrices = prices.some((p) => p.priceWeekend != null)

  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />

      {/* Заголовок */}
      <div className={styles.header}>
        <h1 className={styles.title}>
          Запис на «{priceEntry?.label ?? `Індивідуальний майстер-клас на ${peopleCount} людей`}»
        </h1>
        <div className={styles.meta}>
          <span className={styles.metaItem}>📅 {formatDate(params.date)}</span>
          <span className={styles.metaItem}>🕐 {params.time}</span>
          {hasWeekendPrices && (
            <span className={`${styles.dayBadge} ${weekend ? styles.weekend : styles.weekday}`}>
              {weekend ? 'вихідний' : 'будній день'}
            </span>
          )}
        </div>
      </div>

      {/* Кількість та вартість */}
      <div className={styles.priceCard}>
        <div className={styles.priceRow}>
          <div className={styles.countField}>
            <span className={styles.priceLabel}>Кількість учасників</span>
            <div className={styles.counter}>
              <button type="button" className={styles.counterBtn}
                disabled={peopleCount <= minCount} onClick={() => changeCount(-1)}>−</button>
              <span className={styles.counterValue}>{peopleCount}</span>
              <button type="button" className={styles.counterBtn}
                disabled={peopleCount >= maxCount} onClick={() => changeCount(1)}>+</button>
            </div>
          </div>
          <div className={styles.priceField}>
            <span className={styles.priceLabel}>Вартість</span>
            <span className={styles.priceValue}>{totalPrice.toLocaleString('uk-UA')} грн</span>
          </div>
        </div>
        <p className={styles.prepayNote}>
          ⏰ Час бронюється після внесення передоплати у розмірі {PREPAYMENT} грн
        </p>
      </div>

      {/* Форма */}
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label htmlFor="name">Ім'я</label>
            <input id="name" type="text" placeholder="Олена"
              {...register('name')}
              className={errors.name ? styles.inputError : ''} />
            {errors.name && <span className={styles.error}>{errors.name.message}</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor="surname">Прізвище</label>
            <input id="surname" type="text" placeholder="Коваль"
              {...register('surname')}
              className={errors.surname ? styles.inputError : ''} />
            {errors.surname && <span className={styles.error}>{errors.surname.message}</span>}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="phone">Номер телефону</label>
          <input id="phone" type="tel" placeholder="0501234567"
            {...register('phone')}
            className={errors.phone ? styles.inputError : ''} />
          {errors.phone && <span className={styles.error}>{errors.phone.message}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="instagram">Instagram</label>
          <input id="instagram" type="text" placeholder="@username або посилання"
            {...register('instagram')}
            className={errors.instagram ? styles.inputError : ''} />
          {errors.instagram && <span className={styles.error}>{errors.instagram.message}</span>}
        </div>

        {/* Спосіб оплати */}
        <div className={styles.field}>
          <label>Спосіб оплати</label>
          <div className={styles.payToggle}>
            <button type="button"
              className={`${styles.toggleBtn} ${payMethod === 'card' ? styles.toggleActive : ''}`}
              onClick={() => { setPayMethod('card'); setCertStatus('idle'); setCertError('') }}>
              Карткою
            </button>
            <button type="button"
              className={`${styles.toggleBtn} ${payMethod === 'certificate' ? styles.toggleActive : ''}`}
              onClick={() => { setPayMethod('certificate'); setServerError('') }}>
              Сертифікат
            </button>
          </div>
        </div>

        {/* Блок сертифікату */}
        {payMethod === 'certificate' && (
          <div className={styles.certBlock}>
            <label className={styles.certLabel}>Код сертифікату</label>
            <div className={styles.certRow}>
              <input type="text" placeholder="Введіть номер сертифікату"
                value={certCode}
                onChange={(e) => { setCertCode(e.target.value); setCertStatus('idle'); setCertError('') }}
                className={`${styles.certInput} ${
                  certStatus === 'valid' ? styles.certValid :
                  certStatus === 'invalid' ? styles.certInvalid : ''
                }`} />
              <button type="button" className={styles.certCheckBtn}
                disabled={!certCode.trim() || certStatus === 'checking'}
                onClick={checkCertificate}>
                {certStatus === 'checking' ? '…' : 'Перевірити'}
              </button>
            </div>
            {certStatus === 'valid' && (
              <p className={styles.certOk}>✓ Сертифікат дійсний</p>
            )}
            {certStatus === 'invalid' && (
              <p className={styles.certErr}>{certError}</p>
            )}
          </div>
        )}

        {/* Підсумок оплати */}
        {payMethod === 'card' && (
          <div className={styles.paymentSummary}>
            <div className={styles.payNow}>
              До сплати зараз — <strong>{PREPAYMENT} грн</strong>
            </div>
            {remainder > 0 && (
              <div className={styles.payLater}>
                До сплати під час майстер-класу — {remainder.toLocaleString('uk-UA')} грн
              </div>
            )}
          </div>
        )}

        {serverError && <p className={styles.serverError}>{serverError}</p>}

        <button type="submit" className={styles.submit}
          disabled={submitting || (payMethod === 'certificate' && certStatus !== 'valid')}>
          {submitting ? 'Надсилаємо…'
            : payMethod === 'certificate' ? 'Записатись'
            : 'Записатись та оплатити'}
        </button>
      </form>
    </main>
  )
}
