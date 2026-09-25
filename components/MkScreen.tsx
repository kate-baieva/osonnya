'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Order } from '@/lib/orders'
import type { ScheduleItem } from '@/lib/schedule'
import { STUDIOS } from '@/lib/studios'
import ui from './ui.module.css'
import styles from './MkScreen.module.css'

const ACCOUNTS = ['Готівка студія', 'Ощад ФОП', 'Моно ФОП', 'Переказ на картку', 'WayForPay']

const TYPE_LABEL: Record<string, string> = {
  group: 'Груповий', indiv: 'Індивідуальний', kids: 'Дитячий',
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

const money = (n: number) => `${n.toLocaleString('uk-UA')} грн`

export default function MkScreen({
  studioId,
  mkKey,
  backHref,
}: {
  studioId: string
  mkKey: string
  backHref: string
}) {
  const [slot, setSlot] = useState<ScheduleItem | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState<Order | null>(null)
  const [addingWalkIn, setAddingWalkIn] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/mk?studio=${studioId}&at=${encodeURIComponent(mkKey)}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося завантажити'); return }
      setSlot(json.slot)
      setOrders(json.orders)
    } catch {
      setError("Немає з'єднання")
    } finally {
      setLoading(false)
    }
  }, [studioId, mkKey])

  useEffect(() => { load() }, [load])

  const send = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/mk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studio: studioId, ...payload }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Не вдалося зберегти'); return false }
    await load()
    return true
  }

  const changeAttendance = async (order: Order, next: number) => {
    setOrders((prev) => prev.map((o) => (o.rowIndex === order.rowIndex ? { ...o, attended: next } : o)))
    await send({ action: 'attendance', rowIndex: order.rowIndex, attended: next })
  }

  const expected = orders.reduce((sum, o) => sum + o.people, 0)
  const arrived = orders.reduce((sum, o) => sum + (o.attended ?? o.people), 0)
  const paid = orders.reduce((sum, o) => sum + o.paid, 0)
  const debt = orders.reduce((sum, o) => sum + o.debt, 0)

  const mkDatetime = orders[0]?.mkDatetime ?? slot?.datetime ?? ''

  return (
    <>
      <Link href={backHref} className={ui.backLink}>← Назад до розкладу</Link>

      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>
            {slot ? `${TYPE_LABEL[slot.type] ?? ''} МК · ${formatDay(slot.date)}, ${slot.time}` : 'Майстер-клас'}
          </h1>
          <p className={ui.sub}>
            {STUDIOS[studioId]?.city}
            {slot?.title ? ` · ${slot.title}` : ''}
            {slot && slot.capacity > 0 ? ` · ${slot.booked} з ${slot.capacity} місць` : ''}
            {slot?.master ? ` · веде ${slot.master}` : ''}
          </p>
        </div>
        <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setAddingWalkIn(true)}>
          + Прийшли без запису
        </button>
      </div>

      {error && <p className={ui.error}>{error}</p>}
      {loading && <p className={ui.empty}>Завантаження…</p>}

      {!loading && (
        <>
          <div className={styles.totals}>
            <div className={styles.total}>
              <span className={styles.totalValue}>{expected}</span>
              <span className={styles.totalLabel}>записано осіб</span>
            </div>
            <div className={styles.total}>
              <span className={styles.totalValue}>{arrived}</span>
              <span className={styles.totalLabel}>прийшло</span>
            </div>
            <div className={styles.total}>
              <span className={styles.totalValue}>{money(paid)}</span>
              <span className={styles.totalLabel}>оплачено</span>
            </div>
            {debt > 0 && (
              <div className={`${styles.total} ${styles.totalDebt}`}>
                <span className={styles.totalValue}>{money(debt)}</span>
                <span className={styles.totalLabel}>лишилось зібрати</span>
              </div>
            )}
          </div>

          {orders.length === 0 && <p className={ui.empty}>На цей майстер-клас ще ніхто не записаний</p>}

          <div className={styles.list}>
            {orders.map((order) => {
              const attended = order.attended ?? order.people
              const noShow = attended === 0
              const changed = order.attended !== null && order.attended !== order.people

              return (
                <div key={order.rowIndex} className={`${styles.row} ${noShow ? styles.rowNoShow : ''}`}>
                  <div className={styles.main}>
                    <span className={styles.name}>{order.client || '—'}</span>
                    <span className={styles.meta}>
                      записано {order.people} {order.people === 1 ? 'особу' : 'осіб'}
                      {order.phone ? ` · ${order.phone}` : ''}
                    </span>
                    {order.certificate && <span className={styles.note}>сертифікат № {order.certificate}</span>}
                    {order.promo && <span className={styles.note}>промокод {order.promo}</span>}
                    {order.comment === 'Без запису' && <span className={styles.note}>прийшли без запису</span>}
                  </div>

                  <div className={styles.attend}>
                    <span className={styles.attendLabel}>прийшло</span>
                    <button
                      className={styles.countBtn}
                      disabled={attended <= 0}
                      onClick={() => changeAttendance(order, attended - 1)}
                    >−</button>
                    <span className={`${styles.countVal} ${changed ? styles.countChanged : ''}`}>{attended}</span>
                    <button
                      className={styles.countBtn}
                      onClick={() => changeAttendance(order, attended + 1)}
                    >+</button>
                  </div>

                  <div className={styles.pay}>
                    {order.debt > 0 ? (
                      <>
                        <span className={styles.debt}>Борг {money(order.debt)}</span>
                        <span className={styles.meta}>внесено {order.paid} з {order.amount}</span>
                      </>
                    ) : order.byCertificate ? (
                      <>
                        <span className={styles.ok}>Сертифікатом</span>
                        <span className={styles.meta}>
                          {order.paid > 0 ? `плюс ${money(order.paid)}` : 'доплати немає'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={styles.ok}>Оплачено {money(order.paid)}</span>
                        <span className={styles.meta}>
                          {order.prepayment > 0 ? 'передоплата' : 'на місці'}
                        </span>
                      </>
                    )}
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={`${ui.btn} ${ui.btnSmall} ${order.debt > 0 ? ui.btnPrimary : ''}`}
                      onClick={() => setPaying(order)}
                    >Додати оплату</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {paying && (
        <PaymentDialog
          order={paying}
          onClose={() => setPaying(null)}
          onSave={async (amount, account, date) => {
            const ok = await send({ action: 'payment', rowIndex: paying.rowIndex, amount, account, date })
            if (ok) setPaying(null)
          }}
        />
      )}

      {addingWalkIn && (
        <WalkInDialog
          mkDatetime={mkDatetime}
          mkType={slot?.type === 'indiv' ? 'individual' : 'group'}
          onClose={() => setAddingWalkIn(false)}
          onSave={async (entry) => {
            const ok = await send({ action: 'walk-in', mkDatetime, ...entry })
            if (ok) setAddingWalkIn(false)
          }}
        />
      )}
    </>
  )
}

function PaymentDialog({
  order,
  onClose,
  onSave,
}: {
  order: Order
  onClose: () => void
  onSave: (amount: number, account: string, date: string) => Promise<void>
}) {
  const [amount, setAmount] = useState(order.debt > 0 ? String(order.debt) : '')
  const [account, setAccount] = useState(ACCOUNTS[0])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  return (
    <div className={styles.modalWrap}>
      <div className={styles.modalBack} onClick={onClose} />
      <div className={styles.modalCard}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Додати оплату</h3>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <p className={ui.cardDesc}>
          {order.client} · {order.people} {order.people === 1 ? 'особа' : 'осіб'} ·
          внесено {order.paid} з {order.amount}
        </p>

        <div className={ui.formGrid}>
          <div className={ui.field}>
            <label className={ui.label}>Сума, грн</label>
            <input
              className={ui.input} type="number" value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Дата</label>
            <input className={ui.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={`${ui.field} ${ui.fieldWide}`}>
            <label className={ui.label}>Вид оплати</label>
            <select className={ui.selectInput} value={account} onChange={(e) => setAccount(e.target.value)}>
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className={ui.hint}>
          <b>Куди це потрапить</b>
          У колонки доплати в MK Orders — сума додасться до вже внесеної.
        </div>

        <div className={styles.modalFoot}>
          <button className={ui.btn} onClick={onClose}>Скасувати</button>
          <button
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={saving || !(Number(amount) > 0)}
            onClick={async () => { setSaving(true); await onSave(Number(amount), account, date); setSaving(false) }}
          >{saving ? 'Зберігаємо…' : 'Зберегти'}</button>
        </div>
      </div>
    </div>
  )
}

function WalkInDialog({
  mkDatetime,
  mkType,
  onClose,
  onSave,
}: {
  mkDatetime: string
  mkType: string
  onClose: () => void
  onSave: (entry: Record<string, unknown>) => Promise<void>
}) {
  const [client, setClient] = useState('')
  const [people, setPeople] = useState(1)
  const [amount, setAmount] = useState('')
  const [paid, setPaid] = useState('')
  const [account, setAccount] = useState(ACCOUNTS[0])
  const [saving, setSaving] = useState(false)

  return (
    <div className={styles.modalWrap}>
      <div className={styles.modalBack} onClick={onClose} />
      <div className={styles.modalCard}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Прийшли без запису</h3>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <p className={ui.cardDesc}>Новий запис у MK Orders на {mkDatetime || 'цей майстер-клас'}</p>

        <div className={ui.formGrid}>
          <div className={`${ui.field} ${ui.fieldWide}`}>
            <label className={ui.label}>Ім&apos;я та прізвище</label>
            <input
              className={ui.input} placeholder="Марія Шевченко"
              value={client} onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Скільки осіб</label>
            <div className={ui.stepper}>
              <button className={ui.stepBtn} onClick={() => setPeople((n) => Math.max(1, n - 1))}>−</button>
              <span className={ui.stepVal}>{people}</span>
              <button className={ui.stepBtn} onClick={() => setPeople((n) => n + 1)}>+</button>
            </div>
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Вартість, грн</label>
            <input
              className={ui.input} type="number" placeholder="1300"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Сплачено зараз, грн</label>
            <input
              className={ui.input} type="number" placeholder="1300"
              value={paid} onChange={(e) => setPaid(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Вид оплати</label>
            <select className={ui.selectInput} value={account} onChange={(e) => setAccount(e.target.value)}>
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.modalFoot}>
          <button className={ui.btn} onClick={onClose}>Скасувати</button>
          <button
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={saving || !client.trim()}
            onClick={async () => {
              setSaving(true)
              await onSave({
                client: client.trim(), people,
                amount: Number(amount) || 0,
                paid: Number(paid) || 0,
                account, type: mkType,
              })
              setSaving(false)
            }}
          >{saving ? 'Додаємо…' : 'Додати'}</button>
        </div>
      </div>
    </div>
  )
}
