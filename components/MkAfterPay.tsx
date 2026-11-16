'use client'

import { useState } from 'react'
import styles from './MkAfterPay.module.css'

// Сума сюди приходить із сервера, порахована з таблиці просто зараз.
// У браузері її не редагують і не надсилають назад — сервер однаково
// перерахує все сам, перш ніж виписати рахунок.
export interface AfterPayInfo {
  client: string
  when: string
  people: number
  amount: number
  paid: number
  due: number
}

interface Props {
  token: string
  info: AfterPayInfo
  studioAddress: string
}

const money = (value: number) => `${value.toLocaleString('uk-UA')} грн`

export default function MkAfterPay({ token, info, studioAddress }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/pay-mk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ d: token }),
      })
      const json = await res.json()
      if (!res.ok || !json.paymentUrl) {
        setError(json.error ?? 'Не вдалось почати оплату. Спробуйте ще раз.')
        setBusy(false)
        return
      }
      window.location.href = json.paymentUrl
    } catch {
      setError("Немає з'єднання. Перевірте інтернет і спробуйте ще раз.")
      setBusy(false)
    }
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Доплата за майстер-клас</h1>

      <table className={styles.facts}>
        <tbody>
          <tr>
            <th>Запис на ім&apos;я</th>
            <td>{info.client}</td>
          </tr>
          <tr>
            <th>Коли</th>
            <td>{info.when}</td>
          </tr>
          <tr>
            <th>Учасників</th>
            <td>{info.people}</td>
          </tr>
          <tr>
            <th>Вартість</th>
            <td>{money(info.amount)}</td>
          </tr>
          <tr>
            <th>Сплачено</th>
            <td>{money(info.paid)}</td>
          </tr>
          <tr>
            <th>Лишається доплатити</th>
            <td className={styles.due}>{money(info.due)}</td>
          </tr>
        </tbody>
      </table>

      <button type="button" className={styles.btn} onClick={pay} disabled={busy}>
        {busy ? 'Готуємо оплату…' : `Оплатити ${money(info.due)}`}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      <p className={styles.note}>
        Платити зараз не обов&apos;язково — доплатити можна готівкою в студії
        перед заняттям, за адресою {studioAddress}.
      </p>
    </div>
  )
}
