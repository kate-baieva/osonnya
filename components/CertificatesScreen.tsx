'use client'

import { useCallback, useEffect, useState } from 'react'
import type { IndividualPrice } from '@/lib/google-sheets'
import type { Certificate } from '@/lib/certificates'
import CopyButton from './CopyButton'
import StudioSwitch from './StudioSwitch'
import ui from './ui.module.css'
import styles from './MkScreen.module.css'

const ACCOUNTS = ['Готівка студія', 'Ощад ФОП', 'Моно ФОП', 'Переказ на картку']
const PAPER = 'паперовий'
const DIGITAL = 'електронний'

const money = (n: number) => `${n.toLocaleString('uk-UA')} грн`

export default function CertificatesScreen({
  studioId: fixedStudio,
  canSwitchStudio,
}: {
  studioId: string
  canSwitchStudio: boolean
}) {
  const [studioId, setStudioId] = useState(fixedStudio)
  const [list, setList] = useState<Certificate[]>([])
  const [nextNumber, setNextNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (studio: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/certificates?studio=${studio}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося завантажити'); return }
      setList(json.certificates)
      setNextNumber(json.nextNumber)
    } catch {
      setError("Немає з'єднання")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(studioId) }, [studioId, load])

  const send = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/certificates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studio: studioId, ...payload }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Не вдалося зберегти'); return null }
    await load(studioId)
    return json
  }

  const awaiting = list.filter((c) => c.awaitingPickup)

  return (
    <>
      {canSwitchStudio && <StudioSwitch value={studioId} onChange={setStudioId} />}

      {error && <p className={ui.error}>{error}</p>}
      {notice && (
        <p style={{
          background: '#e4efe3', color: '#4a7c4e', borderRadius: 10,
          padding: '10px 13px', fontSize: 13.5, marginBottom: 14,
        }}>{notice}</p>
      )}

      <section className={ui.card}>
        <h2 className={ui.cardTitle}>
          Чекають видачі{awaiting.length > 0 && ` · ${awaiting.length}`}
        </h2>
        <p className={ui.cardDesc}>
          Паперові сертифікати, куплені онлайн — людина має зайти за ними в студію
        </p>

        {loading && <p className={ui.empty}>Завантаження…</p>}
        {!loading && awaiting.length === 0 && (
          <p className={ui.empty}>Нікого не чекаємо</p>
        )}

        <div className={styles.list}>
          {awaiting.map((cert) => (
            <div key={cert.rowIndex} className={styles.row}>
              <div className={styles.main}>
                <span className={styles.name}>{cert.client || '—'}</span>
                <span className={styles.meta}>
                  № {cert.number} · {cert.mkType} · {cert.people} уч. · діє до {cert.dueDate}
                </span>
              </div>
              <div className={styles.pay}>
                {cert.paid >= cert.amount
                  ? <span className={styles.ok}>Оплачено {money(cert.amount)}</span>
                  : <span className={styles.debt}>Не оплачено {money(cert.amount)}</span>}
              </div>
              <div className={styles.actions}>
                <button
                  className={`${ui.btn} ${ui.btnSmall} ${ui.btnPrimary}`}
                  onClick={async () => {
                    if (!confirm(`Видати сертифікат № ${cert.number} клієнту ${cert.client}?`)) return
                    const done = await send({ action: 'issue', rowIndex: cert.rowIndex })
                    if (done) setNotice(`Сертифікат № ${cert.number} позначено як виданий`)
                  }}
                >Видати</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SellForm
        studioId={studioId}
        nextNumber={nextNumber}
        onSold={(number, dueDate) => {
          setNotice(`Сертифікат № ${number} видано. Діє до ${dueDate}.`)
          load(studioId)
        }}
        onError={setError}
      />
    </>
  )
}

function SellForm({
  studioId,
  nextNumber,
  onSold,
  onError,
}: {
  studioId: string
  nextNumber: string
  onSold: (number: string, dueDate: string) => void
  onError: (message: string) => void
}) {
  const [prices, setPrices] = useState<IndividualPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(0)
  const [groupCount, setGroupCount] = useState(1)
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [account, setAccount] = useState(ACCOUNTS[0])
  const [type, setType] = useState(PAPER)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    setSelected(0)
    setGroupCount(1)
    fetch(`/api/mk-prices?studio=${studioId}`)
      .then((r) => r.json())
      .then((data: IndividualPrice[]) => { if (Array.isArray(data)) setPrices(data) })
      .finally(() => setLoading(false))
  }, [studioId])

  const format = prices[selected]
  const isGroup = format?.label.toLowerCase().includes('груповий') ?? false
  const unitPrice = format ? (format.priceWeekend ?? format.priceWeekday) : 0
  const people = isGroup ? groupCount : (format?.peopleCount ?? 1)
  const amount = isGroup ? unitPrice * groupCount : unitPrice

  const due = new Date()
  due.setMonth(due.getMonth() + 3)
  const dueLabel = due.toLocaleDateString('uk-UA')

  const sell = async () => {
    if (!name.trim() || !surname.trim()) { onError("Вкажіть ім'я та прізвище"); return }
    setSaving(true)
    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studio: studioId, action: 'sell',
          client: `${name.trim()} ${surname.trim()}`,
          amount, people, account, type,
          mkType: format?.label ?? '',
          phone: phone.trim(), email: email.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) { onError(json.error ?? 'Не вдалося зберегти'); return }
      setName(''); setSurname(''); setPhone(''); setEmail('')
      onSold(json.number, json.dueDate)
    } catch {
      onError("Немає з'єднання")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={ui.card}>
      <h2 className={ui.cardTitle}>Видати сертифікат у студії</h2>
      <p className={ui.cardDesc}>Коли людина прийшла й купує на місці</p>

      {loading ? <p className={ui.empty}>Завантаження цін…</p> : (
        <>
          <div className={ui.formGrid}>
            <div className={ui.field}>
              <label className={ui.label}>Ім&apos;я</label>
              <input className={ui.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Марія" />
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Прізвище</label>
              <input className={ui.input} value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Шевченко" />
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Телефон</label>
              <input className={ui.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380 __ ___ __ __" />
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Електронна пошта</label>
              <input className={ui.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@example.com" />
            </div>

            <div className={ui.field}>
              <label className={ui.label}>Номер сертифіката</label>
              <input className={`${ui.input} ${ui.inputLocked}`} value={nextNumber} readOnly tabIndex={-1} />
              <span className={ui.fieldNote}>Наступний за попереднім</span>
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Діє до</label>
              <input className={`${ui.input} ${ui.inputLocked}`} value={dueLabel} readOnly tabIndex={-1} />
              <span className={ui.fieldNote}>3 місяці від сьогодні</span>
            </div>

            <div className={ui.field}>
              <label className={ui.label}>Формат майстер-класу</label>
              <select
                className={ui.selectInput} value={selected}
                onChange={(e) => { setSelected(Number(e.target.value)); setGroupCount(1) }}
              >
                {prices.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Кількість учасників</label>
              {isGroup ? (
                <div className={ui.stepper}>
                  <button className={ui.stepBtn} disabled={groupCount <= 1} onClick={() => setGroupCount((n) => Math.max(1, n - 1))}>−</button>
                  <span className={ui.stepVal}>{groupCount}</span>
                  <button className={ui.stepBtn} onClick={() => setGroupCount((n) => n + 1)}>+</button>
                </div>
              ) : (
                <span className={ui.sub}>{people} — задано форматом</span>
              )}
            </div>

            <div className={ui.field}>
              <label className={ui.label}>Вид оплати</label>
              <select className={ui.selectInput} value={account} onChange={(e) => setAccount(e.target.value)}>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label}>Вид сертифіката</label>
              <select className={ui.selectInput} value={type} onChange={(e) => setType(e.target.value)}>
                <option value={PAPER}>Паперовий</option>
                <option value={DIGITAL}>Електронний</option>
              </select>
            </div>
          </div>

          <div className={ui.summary}>
            <span className={ui.summaryLabel}>
              До сплати{isGroup && groupCount > 1 ? ` · ${groupCount} × ${unitPrice.toLocaleString('uk-UA')}` : ''}
            </span>
            <span className={ui.summaryValue}>{money(amount)}</span>
          </div>

          <button
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={saving || !format}
            onClick={sell}
          >{saving ? 'Зберігаємо…' : 'Видати сертифікат'}</button>

          <div className={ui.hint}>
            <b>Куди це потрапить</b>
            Рядок у «Certificate Orders» з номером, сумою, терміном дії та видом оплати.
            Паперовий одразу позначається виданим — його ж забирають на місці.
          </div>
        </>
      )}
    </section>
  )
}
