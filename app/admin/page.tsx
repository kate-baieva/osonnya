'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Slot } from '@/types'
import type { IndividualPrice } from '@/lib/google-sheets'
import { STUDIOS, type StudioInfo } from '@/lib/studios'
import styles from './admin.module.css'

const STUDIOS_LIST: StudioInfo[] = [STUDIOS.sumy, STUDIOS.if]

type MenuItem = 'group' | 'individual' | 'certificate'

const MENU_ITEMS: { id: MenuItem; label: string }[] = [
  { id: 'group',       label: 'Груповий МК' },
  { id: 'individual',  label: 'Індивідуальний МК' },
  { id: 'certificate', label: 'Сертифікат' },
]

// ─── helpers ────────────────────────────────────────────

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('uk-UA', {
    weekday: 'short', day: 'numeric', month: 'long',
  })
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className={styles.copyBtn} onClick={copy}>
      {copied ? '✓ Скопійовано' : 'Копіювати'}
    </button>
  )
}

// ─── Груповий МК ────────────────────────────────────────

function GroupContent({ studio, origin }: { studio: StudioInfo; origin: string }) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setSlots([])
    fetch(`/api/slots?studio=${studio.id}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSlots(data) })
      .finally(() => setLoading(false))
  }, [studio.id])

  const generalLink = `${origin}${studio.basePath}`

  return (
    <>
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Загальне посилання</h3>
        <p className={styles.cardDesc}>Усі доступні майстер-класи — клієнт обирає сам</p>
        <div className={styles.linkRow}>
          <span className={styles.link}>{generalLink}</span>
          <CopyButton text={generalLink} />
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Посилання на конкретний майстер-клас</h3>
        <p className={styles.cardDesc}>Клієнт одразу потрапляє на форму для обраного слоту</p>

        {loading && <p className={styles.empty}>Завантаження…</p>}
        {!loading && slots.length === 0 && (
          <p className={styles.empty}>Немає доступних слотів</p>
        )}

        <div className={styles.slotList}>
          {slots.map((slot) => {
            const url = `${origin}${studio.basePath}?slot=${encodeURIComponent(slot.id)}`
            return (
              <div key={slot.id} className={styles.slotRow}>
                <div className={styles.slotInfo}>
                  {slot.title && <span className={styles.slotTitle}>{slot.title}</span>}
                  <span className={styles.slotDate}>{formatDate(slot.date)}</span>
                  <span className={styles.slotTime}>о {slot.time}</span>
                  <span className={styles.slotSpots}>
                    {slot.spotsRemaining} з {slot.capacity} місць
                  </span>
                </div>
                <div className={styles.linkRow}>
                  <span className={styles.link}>{url}</span>
                  <CopyButton text={url} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}

// ─── Індивідуальний МК ──────────────────────────────────

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return dow === 0 || dow === 6
}

function formatDateLabel(d: string): string {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function IndividualContent({ studio, origin }: { studio: StudioInfo; origin: string }) {
  const today = new Date().toISOString().split('T')[0]

  const [prices, setPrices]           = useState<IndividualPrice[]>([])
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [date, setDate]               = useState('')
  const [time, setTime]               = useState('')
  const [peopleCount, setPeopleCount] = useState(2)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)

  // Завантажуємо ціни при зміні студії
  useEffect(() => {
    setLoadingPrices(true)
    setGeneratedLink(null)
    fetch(`/api/individual-prices?studio=${studio.id}`)
      .then((r) => r.json())
      .then((data: IndividualPrice[]) => {
        if (Array.isArray(data)) {
          setPrices(data)
          if (data.length > 0) setPeopleCount(data[0].peopleCount)
        }
      })
      .finally(() => setLoadingPrices(false))
  }, [studio.id])

  // Ціна для поточних параметрів
  const priceEntry = prices.find((p) => p.peopleCount === peopleCount)
  const weekend    = date ? isWeekend(date) : false
  const totalPrice = priceEntry
    ? (weekend && priceEntry.priceWeekend != null ? priceEntry.priceWeekend : priceEntry.priceWeekday)
    : null

  // Доступні кількості учасників
  const availableCounts = prices.map((p) => p.peopleCount)
  const minCount = availableCounts[0] ?? 2
  const maxCount = availableCounts[availableCounts.length - 1] ?? 10

  const changeCount = useCallback((delta: number) => {
    setPeopleCount((prev) => {
      const next = prev + delta
      if (availableCounts.includes(next)) return next
      // Знайти найближче доступне
      const sorted = [...availableCounts].sort((a, b) =>
        Math.abs(a - next) - Math.abs(b - next)
      )
      return sorted[0] ?? prev
    })
    setGeneratedLink(null)
  }, [availableCounts])

  const isValid = date.length > 0 && time.length > 0 && totalPrice !== null

  const generate = () => {
    if (!totalPrice) return
    const payload = { studio: studio.id, date, time, peopleCount, totalPrice }
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    setGeneratedLink(`${origin}${studio.basePath}/individual?d=${encoded}`)
  }

  const hasWeekendPrices = prices.some((p) => p.priceWeekend != null)

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Створити посилання для запису</h3>
      <p className={styles.cardDesc}>Заповніть параметри — клієнт отримає персональне посилання</p>

      {loadingPrices ? (
        <p className={styles.empty}>Завантаження цін…</p>
      ) : (
        <div className={styles.indivForm}>

          {/* Дата + час */}
          <div className={styles.indivRow}>
            <div className={styles.indivField}>
              <label className={styles.indivLabel}>Дата</label>
              <input
                type="date" min={today}
                value={date}
                onChange={(e) => { setDate(e.target.value); setGeneratedLink(null) }}
                className={styles.indivInput}
              />
            </div>
            <div className={styles.indivField}>
              <label className={styles.indivLabel}>Час</label>
              <input
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); setGeneratedLink(null) }}
                className={styles.indivInput}
              />
            </div>
          </div>

          {/* Кількість учасників */}
          <div className={styles.indivField}>
            <label className={styles.indivLabel}>Кількість учасників</label>
            <div className={styles.counter}>
              <button
                type="button" className={styles.counterBtn}
                disabled={peopleCount <= minCount}
                onClick={() => changeCount(-1)}
              >−</button>
              <span className={styles.counterValue}>{peopleCount}</span>
              <button
                type="button" className={styles.counterBtn}
                disabled={peopleCount >= maxCount}
                onClick={() => changeCount(1)}
              >+</button>
            </div>
            {priceEntry && <span className={styles.indivHint}>{priceEntry.label}</span>}
          </div>

          {/* Підсумок */}
          <div className={styles.indivSummary}>
            <div className={styles.indivSummaryMain}>
              <span className={styles.indivSummaryLabel}>Вартість</span>
              {totalPrice !== null ? (
                <span className={styles.indivSummaryPrice}>
                  {totalPrice.toLocaleString('uk-UA')} грн
                </span>
              ) : (
                <span className={styles.indivSummaryPrice}>—</span>
              )}
            </div>
            {date && (
              <div className={styles.indivSummaryMeta}>
                <span>{formatDateLabel(date)}{time ? ` о ${time}` : ''}</span>
                {hasWeekendPrices && (
                  <span className={`${styles.dayBadge} ${weekend ? styles.dayBadgeWeekend : styles.dayBadgeWeekday}`}>
                    {weekend ? 'вихідний' : 'будній день'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Кнопка */}
          <button
            type="button"
            className={styles.generateBtn}
            disabled={!isValid}
            onClick={generate}
          >
            Згенерувати посилання
          </button>

          {/* Результат */}
          {generatedLink && (
            <div className={styles.generatedBlock}>
              <p className={styles.generatedLabel}>Посилання для клієнта:</p>
              <div className={styles.linkRow}>
                <span className={styles.link}>{generatedLink}</span>
                <CopyButton text={generatedLink} />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Сертифікат ──────────────────────────────────────────

function CertificateContent({ studio }: { studio: StudioInfo }) {
  const [prices, setPrices]               = useState<IndividualPrice[]>([])
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [selectedIdx, setSelectedIdx]     = useState(0)
  const [groupCount, setGroupCount]       = useState(1)   // лише для Групового МК

  useEffect(() => {
    setLoadingPrices(true)
    setSelectedIdx(0)
    setGroupCount(1)
    fetch(`/api/mk-prices?studio=${studio.id}`)
      .then((r) => r.json())
      .then((data: IndividualPrice[]) => { if (Array.isArray(data)) setPrices(data) })
      .finally(() => setLoadingPrices(false))
  }, [studio.id])

  const selected  = prices[selectedIdx]
  const isGroup   = selected?.label.toLowerCase().includes('груповий')

  // Ціна за сертифікат: завжди ціна вихідного дня (якщо є)
  const unitPrice = selected ? (selected.priceWeekend ?? selected.priceWeekday) : 0
  // Для Групового МК множимо на кількість; для решти — фіксована ціна з таблиці
  const totalPrice = isGroup ? unitPrice * groupCount : unitPrice
  // Кількість для відображення
  const displayCount = isGroup ? groupCount : (selected?.peopleCount ?? 1)

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Параметри сертифіката</h3>
      <p className={styles.cardDesc}>Оберіть формат та кількість учасників — ціна підтягується автоматично</p>

      {loadingPrices ? (
        <p className={styles.empty}>Завантаження цін…</p>
      ) : (
        <div className={styles.indivForm}>

          {/* Формат МК */}
          <div className={styles.indivField}>
            <label className={styles.indivLabel}>Формат майстер-класу</label>
            <select
              className={styles.indivSelect}
              value={selectedIdx}
              onChange={(e) => { setSelectedIdx(Number(e.target.value)); setGroupCount(1) }}
            >
              {prices.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Кількість учасників */}
          {selected && (
            <div className={styles.indivField}>
              <label className={styles.indivLabel}>Кількість учасників</label>
              {isGroup ? (
                // Для Групового МК — лічильник
                <div className={styles.counter}>
                  <button type="button" className={styles.counterBtn}
                    disabled={groupCount <= 1}
                    onClick={() => setGroupCount((n) => Math.max(1, n - 1))}>−</button>
                  <span className={styles.counterValue}>{groupCount}</span>
                  <button type="button" className={styles.counterBtn}
                    onClick={() => setGroupCount((n) => n + 1)}>+</button>
                </div>
              ) : (
                // Для решти — фіксована, береться з формату
                <div className={styles.certPeopleCount}>
                  {displayCount} {displayCount === 1 ? 'учасник' : 'учасники/ків'}
                </div>
              )}
            </div>
          )}

          {/* Вартість */}
          {selected && (
            <div className={styles.indivSummary}>
              <div className={styles.indivSummaryMain}>
                <span className={styles.indivSummaryLabel}>Вартість</span>
                <span className={styles.indivSummaryPrice}>
                  {totalPrice.toLocaleString('uk-UA')} грн
                </span>
              </div>
              {isGroup && groupCount > 1 && (
                <span className={styles.certPriceNote}>
                  {groupCount} × {unitPrice.toLocaleString('uk-UA')} грн
                </span>
              )}
            </div>
          )}

        </div>
      )}
    </section>
  )
}

// ─── Заглушка ────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className={styles.comingSoon}>
      <span className={styles.comingSoonIcon}>🏺</span>
      <p>Розділ «{label}» буде доступний незабаром</p>
    </div>
  )
}

// ─── Вміст таба однієї студії ───────────────────────────

function StudioTab({ studio, origin }: { studio: StudioInfo; origin: string }) {
  const [activeMenu, setActiveMenu] = useState<MenuItem>('group')

  return (
    <div className={styles.tabLayout}>
      <nav className={styles.sideNav}>
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`${styles.navItem} ${activeMenu === item.id ? styles.navItemActive : ''}`}
            onClick={() => setActiveMenu(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabContent}>
        {activeMenu === 'group'       && <GroupContent studio={studio} origin={origin} />}
        {activeMenu === 'individual'  && <IndividualContent studio={studio} origin={origin} />}
        {activeMenu === 'certificate' && <CertificateContent studio={studio} />}
      </div>
    </div>
  )
}

// ─── Головна сторінка ───────────────────────────────────

export default function AdminPage() {
  const [origin, setOrigin] = useState('')
  const [activeStudio, setActiveStudio] = useState<string>('sumy')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const studio = STUDIOS_LIST.find((s) => s.id === activeStudio)!

  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
      <h1 className={styles.title}>Адмін панель</h1>

      <div className={styles.studioTabs}>
        {STUDIOS_LIST.map((s) => (
          <button
            key={s.id}
            className={`${styles.studioTab} ${activeStudio === s.id ? styles.studioTabActive : ''}`}
            onClick={() => setActiveStudio(s.id)}
          >
            {s.city}
          </button>
        ))}
      </div>

      {origin && <StudioTab key={activeStudio} studio={studio} origin={origin} />}
    </main>
  )
}
