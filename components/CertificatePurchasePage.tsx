'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { STUDIOS } from '@/lib/studios'
import styles from './CertificatePurchasePage.module.css'

// ─── Типи ────────────────────────────────────────────────

interface CertParams {
  studio: string
  mkLabel: string
  peopleCount: number
  price: number
}

const formSchema = z.object({
  name:      z.string().min(2, 'Введіть ім\'я (мінімум 2 символи)').max(50),
  surname:   z.string().min(2, 'Введіть прізвище (мінімум 2 символи)').max(50),
  phone:     z.string().min(1, 'Введіть номер телефону')
               .regex(/^\+?3?8?0?\d{9}$|^0\d{9}$/, 'Введіть коректний номер (наприклад: 0501234567)'),
  instagram: z.string().min(1, 'Введіть нік або посилання на Instagram').max(100),
})
type FormInput = z.infer<typeof formSchema>

// ─── Helpers ─────────────────────────────────────────────

function decodeParams(raw: string): CertParams | null {
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(b64)))
    return JSON.parse(json) as CertParams
  } catch { return null }
}

function pluralPeople(n: number): string {
  if (n === 1) return '1 учасник'
  if (n < 5)  return `${n} учасники`
  return `${n} учасників`
}

const RULES = [
  'Сертифікат дійсний протягом 3 місяців з дати придбання. Кінцева дата дії зазначена на сертифікаті.',
  'Сертифікат поширюється на формат майстер-класу та кількість учасників, зазначені в сертифікаті.',
  'Сертифікат дійсний лише для зазначеного на ньому формату майстер-класу та кількості учасників. Обмін на інші послуги або повернення різниці у вартості не передбачені.',
  'Для використання сертифіката необхідно зазначити номер сертифіката під час бронювання місця на майстер-клас.',
  'Сертифікат можна використати лише один раз, якщо інше не зазначено в його умовах.',
  'Після закінчення терміну дії сертифікат вважається недійсним і не підлягає продовженню чи відшкодуванню.',
]

// ─── Компонент ───────────────────────────────────────────

export default function CertificatePurchasePage({ studioId }: { studioId: string }) {
  const searchParams = useSearchParams()
  const studio = STUDIOS[studioId]

  const [params, setParams]         = useState<CertParams | null>(null)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
  })

  useEffect(() => {
    const d = searchParams.get('d')
    if (d) setParams(decodeParams(d))
  }, [searchParams])

  const onSubmit = async (data: FormInput) => {
    if (!params) return
    setServerError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/buy-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ...params }),
      })
      const json = await res.json()
      if (!res.ok) { setServerError(json.error ?? 'Сталася помилка. Спробуйте ще раз.'); return }
      if (json.paymentUrl) { window.location.href = json.paymentUrl; return }
    } catch {
      setServerError('Немає з\'єднання з інтернетом. Спробуйте ще раз.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!params) {
    return (
      <main className={styles.main}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <p className={styles.errorMsg}>Посилання недійсне або застаріло. Зверніться до студії.</p>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />

      {/* Заголовок */}
      <div className={styles.header}>
        <div className={styles.certBadge}>🎁 Подарунковий сертифікат</div>
        <h1 className={styles.title}>
          Сертифікат на «{params.mkLabel}»
        </h1>
        <p className={styles.subtitle}>
          {pluralPeople(params.peopleCount)} · {studio?.name}
        </p>
      </div>

      {/* Правила */}
      <div className={styles.rulesCard}>
        <h2 className={styles.rulesTitle}>Правила використання подарункового сертифіката</h2>
        <ul className={styles.rulesList}>
          {RULES.map((rule, i) => (
            <li key={i} className={styles.rulesItem}>{rule}</li>
          ))}
        </ul>
      </div>

      {/* Форма */}
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <h2 className={styles.formTitle}>Дані покупця</h2>

        <div className={styles.formRow}>
          <div className={styles.field}>
            <label htmlFor="name">Ім'я</label>
            <input id="name" type="text" placeholder="Олена"
              {...register('name')} className={errors.name ? styles.inputError : ''} />
            {errors.name && <span className={styles.error}>{errors.name.message}</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor="surname">Прізвище</label>
            <input id="surname" type="text" placeholder="Коваль"
              {...register('surname')} className={errors.surname ? styles.inputError : ''} />
            {errors.surname && <span className={styles.error}>{errors.surname.message}</span>}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="phone">Номер телефону</label>
          <input id="phone" type="tel" placeholder="0501234567"
            {...register('phone')} className={errors.phone ? styles.inputError : ''} />
          {errors.phone && <span className={styles.error}>{errors.phone.message}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="instagram">Instagram</label>
          <input id="instagram" type="text" placeholder="@username або посилання"
            {...register('instagram')} className={errors.instagram ? styles.inputError : ''} />
          {errors.instagram && <span className={styles.error}>{errors.instagram.message}</span>}
        </div>

        {/* Сума до сплати */}
        <div className={styles.paymentBlock}>
          <span className={styles.payLabel}>До сплати</span>
          <span className={styles.payAmount}>{params.price.toLocaleString('uk-UA')} грн</span>
        </div>

        {serverError && <p className={styles.serverError}>{serverError}</p>}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Надсилаємо…' : 'Оплатити'}
        </button>
      </form>
    </main>
  )
}
