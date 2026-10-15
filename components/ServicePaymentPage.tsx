'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { STUDIOS } from '@/lib/studios'
import LegalLinks from './LegalLinks'
import styles from './ServicePaymentPage.module.css'

// Сума приходить у підписаному посиланні. Тут її лише показуємо —
// перевіряє підпис сервер, у браузері для цього немає ключа.
interface ServiceInfo {
  comment: string
  amount: number
}

const formSchema = z.object({
  name:    z.string().min(2, 'Введіть ім\'я (мінімум 2 символи)').max(50),
  surname: z.string().min(2, 'Введіть прізвище (мінімум 2 символи)').max(50),
  phone:   z.string().min(1, 'Введіть номер телефону')
             .regex(/^\+?3?8?0?\d{9}$|^0\d{9}$/, 'Введіть коректний номер (наприклад: 0501234567)'),
  email:   z.string().min(1, 'Введіть email').email('Введіть коректний email').max(100),
})
type FormInput = z.infer<typeof formSchema>

export default function ServicePaymentPage({ studioId }: { studioId: string }) {
  const studio = STUDIOS[studioId] ?? STUDIOS.sumy
  const searchParams = useSearchParams()

  const [token, setToken] = useState<string | null>(null)
  const [info, setInfo] = useState<ServiceInfo | null>(null)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
  })

  useEffect(() => {
    const d = searchParams.get('d')
    if (!d) return
    setToken(d)
    // Показуємо те, що в посиланні. Якщо його підробили, сума тут зміниться,
    // але оплата не почнеться — сервер звірить підпис
    try {
      const [payload] = d.split('.')
      const json = JSON.parse(
        decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))),
      )
      if (typeof json.amount === 'number' && typeof json.comment === 'string') {
        setInfo({ comment: json.comment, amount: json.amount })
      }
    } catch {
      setInfo(null)
    }
  }, [searchParams])

  const onSubmit = async (data: FormInput) => {
    if (!token) return
    setServerError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/pay-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, d: token }),
      })
      const json = await res.json()
      if (!res.ok) { setServerError(json.error ?? 'Сталася помилка. Спробуйте ще раз.'); return }
      if (json.paymentUrl) { window.location.href = json.paymentUrl; return }
      setServerError('Не вдалося перейти до оплати. Спробуйте ще раз.')
    } catch {
      setServerError('Немає з\'єднання з інтернетом. Спробуйте ще раз.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token || !info) {
    return (
      <main className={styles.main}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <p className={styles.errorMsg}>
          Посилання недійсне або застаріло. Зверніться, будь ласка, до студії.
        </p>
        <LegalLinks />
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />

      <h1 className={styles.title}>
        Оплата послуги в студії кераміки Осоння {studio.city}
      </h1>

      <div className={styles.serviceBox}>
        <span className={styles.serviceLabel}>Послуга</span>
        <span className={styles.serviceText}>{info.comment}</span>
      </div>

      <div className={styles.payLine}>
        <span className={styles.payLabel}>До сплати</span>
        <span className={styles.payValue}>{info.amount.toLocaleString('uk-UA')} грн</span>
      </div>

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="name">Ім&apos;я</label>
            <input id="name" type="text" placeholder="Марина"
              {...register('name')} className={errors.name ? styles.inputError : ''} />
            {errors.name && <span className={styles.error}>{errors.name.message}</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor="surname">Прізвище</label>
            <input id="surname" type="text" placeholder="Лисянська"
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
          <label htmlFor="email">Email</label>
          <input id="email" type="email" placeholder="example@email.com"
            {...register('email')} className={errors.email ? styles.inputError : ''} />
          {errors.email && <span className={styles.error}>{errors.email.message}</span>}
        </div>

        {serverError && <p className={styles.serverError}>{serverError}</p>}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Переходимо…' : 'Перейти до оплати'}
        </button>
      </form>

      <LegalLinks />
    </main>
  )
}
