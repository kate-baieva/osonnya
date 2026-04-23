'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { formSchema, type FormInput } from '@/lib/validation'
import type { Slot } from '@/types'
import styles from './RegistrationForm.module.css'

interface Props {
  selectedSlot: Slot | null
  onSuccess: () => void
}

export default function RegistrationForm({ selectedSlot, onSuccess }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { peopleCount: 1 },
  })

  const onSubmit = async (data: FormInput) => {
    console.log('[form] onSubmit викликано, data:', data, 'selectedSlot:', selectedSlot)
    if (!selectedSlot) return
    setServerError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, slotId: selectedSlot.id }),
      })
      const json = await res.json()

      if (!res.ok) {
        setServerError(json.error ?? 'Сталася помилка. Спробуйте ще раз.')
        return
      }

      reset()
      onSuccess()
    } catch {
      setServerError('Немає з\'єднання з інтернетом. Перевірте з\'єднання і спробуйте ще раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        console.log('[form] submit подія')
        handleSubmit(
          (data) => { console.log('[form] ✅ валідація ок, data:', data); return onSubmit(data) },
          (errs) => { console.log('[form] ❌ помилки валідації:', Object.fromEntries(Object.entries(errs).map(([k,v]) => [k, (v as any)?.message]))) }
        )(e)
      }}
      noValidate
    >
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

      {serverError && <p className={styles.serverError}>{serverError}</p>}

      <button
        type="submit"
        className={styles.submit}
        disabled={!selectedSlot || submitting}
        onClick={() => console.log('[form] клік на кнопку, selectedSlot:', selectedSlot, 'errors:', errors)}
      >
        {submitting ? 'Надсилаємо…' : 'Записатись'}
      </button>

      {!selectedSlot && (
        <p className={styles.hint}>Спочатку оберіть слот вище</p>
      )}
    </form>
  )
}
