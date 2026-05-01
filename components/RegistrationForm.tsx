'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { formSchema, type FormInput } from '@/lib/validation'
import type { Slot } from '@/types'
import styles from './RegistrationForm.module.css'

const PREPAYMENT_PER_PERSON = 650

interface CertValidation {
  status: 'idle' | 'checking' | 'valid' | 'invalid'
  peopleCount?: number
  expiresAt?: string
  reason?: string
}

interface Props {
  selectedSlot: Slot | null
  onSuccess: () => void
}

function formatUkDate(iso: string) {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function RegistrationForm({ selectedSlot, onSuccess }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [payMethod, setPayMethod] = useState<'card' | 'certificate'>('card')
  const [certCode, setCertCode] = useState('')
  const [certVal, setCertVal] = useState<CertValidation>({ status: 'idle' })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { peopleCount: 1 },
  })

  const peopleCount = watch('peopleCount') || 1

  // Скільки людей покриває сертифікат і скільки треба доплатити
  const certCovers  = certVal.status === 'valid' ? (certVal.peopleCount ?? 0) : 0
  const extraCount  = certCovers > 0 ? Math.max(0, peopleCount - certCovers) : 0
  const extraAmount = extraCount * PREPAYMENT_PER_PERSON
  const isMixed     = certVal.status === 'valid' && extraCount > 0

  const checkCertificate = async () => {
    if (!certCode.trim()) return
    setCertVal({ status: 'checking' })
    try {
      const res = await fetch('/api/validate-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: certCode.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setCertVal({ status: 'invalid', reason: json.error ?? 'Помилка перевірки' })
        return
      }
      if (!json.valid) {
        setCertVal({ status: 'invalid', reason: json.reason })
        return
      }
      setCertVal({ status: 'valid', peopleCount: json.peopleCount, expiresAt: json.expiresAt })
    } catch {
      setCertVal({ status: 'invalid', reason: 'Немає з\'єднання. Спробуйте ще раз.' })
    }
  }

  const switchPayMethod = (method: 'card' | 'certificate') => {
    setPayMethod(method)
    setCertVal({ status: 'idle' })
    setCertCode('')
    setServerError(null)
  }

  const onSubmit = async (data: FormInput) => {
    if (!selectedSlot) return

    if (payMethod === 'certificate' && certVal.status !== 'valid') {
      setServerError('Спочатку перевірте код сертифікату')
      return
    }

    setServerError(null)
    setSubmitting(true)

    try {
      const body: Record<string, unknown> = { ...data, slotId: selectedSlot.id }
      if (payMethod === 'certificate') body.certificateCode = certCode.trim()

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()

      if (!res.ok) {
        setServerError(json.error ?? 'Сталася помилка. Спробуйте ще раз.')
        return
      }

      // Є посилання на оплату → редирект (картка або cert+доплата)
      if (json.paymentUrl) {
        window.location.href = json.paymentUrl
        return
      }

      // Лише сертифікат → одразу успіх
      reset()
      setCertCode('')
      setCertVal({ status: 'idle' })
      onSuccess()
    } catch {
      setServerError('Немає з\'єднання з інтернетом. Перевірте з\'єднання і спробуйте ще раз.')
    } finally {
      setSubmitting(false)
    }
  }

  // Текст та стан кнопки Submit
  const submitLabel = submitting
    ? 'Надсилаємо…'
    : payMethod === 'certificate' && certVal.status === 'valid' && !isMixed
      ? 'Записатись'
      : 'Записатись та оплатити'

  const submitDisabled =
    !selectedSlot ||
    submitting ||
    (payMethod === 'certificate' && certVal.status !== 'valid')

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="name">Ім'я</label>
          <input
            id="name"
            type="text"
            placeholder="Олена"
            {...register('name')}
            className={errors.name ? styles.inputError : ''}
          />
          {errors.name && <span className={styles.error}>{errors.name.message}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="surname">Прізвище</label>
          <input
            id="surname"
            type="text"
            placeholder="Коваль"
            {...register('surname')}
            className={errors.surname ? styles.inputError : ''}
          />
          {errors.surname && <span className={styles.error}>{errors.surname.message}</span>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="phone">Номер телефону</label>
        <input
          id="phone"
          type="tel"
          placeholder="0501234567"
          {...register('phone')}
          className={errors.phone ? styles.inputError : ''}
        />
        {errors.phone && <span className={styles.error}>{errors.phone.message}</span>}
      </div>

      <div className={styles.field}>
        <label htmlFor="instagram">
          Instagram <span className={styles.optional}>(необов'язково)</span>
        </label>
        <input
          id="instagram"
          type="text"
          placeholder="@username або посилання"
          {...register('instagram')}
          className={errors.instagram ? styles.inputError : ''}
        />
        {errors.instagram && <span className={styles.error}>{errors.instagram.message}</span>}
      </div>

      <div className={styles.field}>
        <label htmlFor="peopleCount">Кількість людей</label>
        <input
          id="peopleCount"
          type="number"
          min={1}
          max={selectedSlot?.spotsRemaining ?? 20}
          {...register('peopleCount', { valueAsNumber: true })}
          className={errors.peopleCount ? styles.inputError : ''}
        />
        {errors.peopleCount && (
          <span className={styles.error}>{errors.peopleCount.message}</span>
        )}
        {selectedSlot && (
          <span className={styles.hint}>Вільних місць: {selectedSlot.spotsRemaining}</span>
        )}
      </div>

      {/* Вибір способу оплати */}
      <div className={styles.field}>
        <label>Спосіб оплати</label>
        <div className={styles.payToggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${payMethod === 'card' ? styles.toggleBtnActive : ''}`}
            onClick={() => switchPayMethod('card')}
          >
            Карткою
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${payMethod === 'certificate' ? styles.toggleBtnActive : ''}`}
            onClick={() => switchPayMethod('certificate')}
          >
            Сертифікат
          </button>
        </div>
      </div>

      {/* Блок введення сертифікату */}
      {payMethod === 'certificate' && (
        <div className={styles.certBlock}>
          <label htmlFor="certCode" className={styles.certLabel}>Код сертифікату</label>
          <div className={styles.certRow}>
            <input
              id="certCode"
              type="text"
              placeholder="Введіть номер сертифікату"
              value={certCode}
              onChange={(e) => {
                setCertCode(e.target.value)
                setCertVal({ status: 'idle' })
              }}
              className={`${styles.certInput} ${
                certVal.status === 'valid'   ? styles.certInputValid :
                certVal.status === 'invalid' ? styles.certInputInvalid : ''
              }`}
            />
            <button
              type="button"
              className={styles.certCheckBtn}
              onClick={checkCertificate}
              disabled={!certCode.trim() || certVal.status === 'checking'}
            >
              {certVal.status === 'checking' ? '…' : 'Перевірити'}
            </button>
          </div>

          {/* Сертифікат дійсний — лише сертифікат */}
          {certVal.status === 'valid' && !isMixed && (
            <p className={styles.certValid}>
              ✓ Сертифікат {certCode} діє до {formatUkDate(certVal.expiresAt!)} ·{' '}
              {certVal.peopleCount}{' '}
              {certVal.peopleCount === 1 ? 'учасник' : 'учасники/ків'}
            </p>
          )}

          {/* Сертифікат + доплата */}
          {certVal.status === 'valid' && isMixed && (
            <div className={styles.mixedNotice}>
              <p>
                Сертифікат {certCode} діє до {formatUkDate(certVal.expiresAt!)}.
              </p>
              <p>
                Сертифікат {certCode} діє на {certVal.peopleCount}{' '}
                {certVal.peopleCount === 1 ? 'учасника' : 'учасників'}.
                Вартість участі додаткових учасників — {PREPAYMENT_PER_PERSON} грн за людину.
              </p>
              <p className={styles.mixedPayLine}>
                Внесіть, будь ласка, передоплату за {extraCount} додатк.{' '}
                {extraCount === 1 ? 'учасника' : 'учасників'} —{' '}
                <strong>{extraAmount} грн</strong>.
              </p>
            </div>
          )}

          {certVal.status === 'invalid' && (
            <p className={styles.certInvalid}>{certVal.reason}</p>
          )}
        </div>
      )}

      {serverError && <p className={styles.serverError}>{serverError}</p>}

      <button
        type="submit"
        className={styles.submit}
        disabled={submitDisabled}
      >
        {submitLabel}
      </button>

      {!selectedSlot && (
        <p className={styles.hint}>Спочатку оберіть слот вище</p>
      )}
    </form>
  )
}
