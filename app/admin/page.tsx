'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Slot } from '@/types'
import type { IndividualPrice } from '@/lib/google-sheets'
import { STUDIOS, type StudioInfo } from '@/lib/studios'
import styles from './admin.module.css'

const STUDIOS_LIST: StudioInfo[] = [STUDIOS.sumy, STUDIOS.if]

type MenuItem = 'group' | 'individual' | 'certificate' | 'promo' | 'users'

const MENU_ITEMS: { id: MenuItem; label: string }[] = [
  { id: 'group',       label: 'Груповий МК' },
  { id: 'individual',  label: 'Індивідуальний МК' },
  { id: 'certificate', label: 'Сертифікат' },
  { id: 'promo',       label: 'Промокод' },
  { id: 'users',       label: 'Майстрині' },
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

function CertificateContent({ studio, origin }: { studio: StudioInfo; origin: string }) {
  const [prices, setPrices]               = useState<IndividualPrice[]>([])
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [selectedIdx, setSelectedIdx]     = useState(0)
  const [groupCount, setGroupCount]       = useState(1)   // лише для Групового МК
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)

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

  const generateLink = () => {
    if (!selected || !origin) return
    const payload = {
      studio: studio.id,
      mkLabel: selected.label,
      peopleCount: displayCount,
      price: totalPrice,
    }
    // unescape(encodeURIComponent(...)) — безпечний btoa для кирилиці
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    setGeneratedLink(`${origin}${studio.basePath}/certificate?d=${encoded}`)
  }

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

          {/* Кнопка генерації */}
          <button
            type="button"
            className={styles.generateBtn}
            disabled={!selected}
            onClick={() => { setGeneratedLink(null); generateLink() }}
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

// ─── Промокод ────────────────────────────────────────────

const PROMO_TYPES = [
  { value: 'group',      label: 'Груповий МК' },
  { value: 'individual', label: 'Індивідуальний МК' },
  { value: 'any',        label: 'Будь-який МК' },
]

function PromoContent({ studio }: { studio: StudioInfo }) {
  const [contact, setContact]   = useState('')
  const [discount, setDiscount] = useState(10)
  const [mkType, setMkType]     = useState('group')
  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState('')
  const [created, setCreated]   = useState<{ code: string; discount: number } | null>(null)

  const generate = async () => {
    if (!contact.trim()) { setError('Вкажіть контакт'); return }
    if (discount <= 0 || discount > 100) { setError('Знижка має бути від 1 до 100%'); return }
    setError(''); setCreating(true); setCreated(null)
    try {
      const res = await fetch('/api/create-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio: studio.id, contact: contact.trim(), discountPercent: discount, mkType }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Помилка. Спробуйте ще раз.'); return }
      setCreated({ code: json.code, discount: json.discountPercent })
    } catch {
      setError('Немає з\'єднання. Спробуйте ще раз.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Створити промокод</h3>
      <p className={styles.cardDesc}>Разова знижка. Термін дії — 3 місяці, заповнюється автоматично.</p>

      <div className={styles.indivForm}>
        <div className={styles.indivField}>
          <label className={styles.indivLabel}>Контакт (кому видано)</label>
          <input
            type="text" className={styles.indivInput}
            placeholder="Ім'я / Instagram / телефон"
            value={contact}
            onChange={(e) => { setContact(e.target.value); setCreated(null) }}
          />
        </div>

        <div className={styles.indivRow}>
          <div className={styles.indivField}>
            <label className={styles.indivLabel}>Знижка, %</label>
            <input
              type="number" min={1} max={100}
              className={`${styles.indivInput} ${styles.indivInputShort}`}
              value={discount}
              onChange={(e) => { setDiscount(Number(e.target.value)); setCreated(null) }}
            />
          </div>
          <div className={styles.indivField}>
            <label className={styles.indivLabel}>Діє на</label>
            <select
              className={styles.indivSelect}
              value={mkType}
              onChange={(e) => { setMkType(e.target.value); setCreated(null) }}
            >
              {PROMO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {error && <p className={styles.empty} style={{ color: '#c00' }}>{error}</p>}

        <button type="button" className={styles.generateBtn} disabled={creating} onClick={generate}>
          {creating ? 'Створюємо…' : 'Створити промокод'}
        </button>

        {created && (
          <div className={styles.generatedBlock}>
            <p className={styles.generatedLabel}>
              Промокод (знижка {created.discount}%) — надішліть клієнту:
            </p>
            <div className={styles.linkRow}>
              <span className={styles.link} style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                {created.code}
              </span>
              <CopyButton text={created.code} />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Майстрині ───────────────────────────────────────────

interface AdminUser {
  rowIndex: number
  name: string
  login: string
  role: 'admin' | 'master'
  studio: string | null
  active: boolean
}

function UsersContent({ studio }: { studio: StudioInfo }) {
  const [users, setUsers]     = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName]       = useState('')
  const [login, setLogin]     = useState('')
  const [userStudio, setUserStudio] = useState(studio.id)
  const [creating, setCreating] = useState(false)
  const [error, setError]     = useState('')
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const json = await res.json()
      if (Array.isArray(json)) setUsers(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setUserStudio(studio.id) }, [studio.id])

  const create = async () => {
    setError(''); setCreated(null); setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, login, role: 'master', studio: userStudio }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося створити'); return }
      setCreated({ login: json.login, password: json.password })
      setName(''); setLogin('')
      await load()
    } catch {
      setError('Немає з\'єднання. Спробуйте ще раз.')
    } finally {
      setCreating(false)
    }
  }

  const resetPassword = async (user: AdminUser) => {
    setError(''); setCreated(null)
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex: user.rowIndex, action: 'reset-password' }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Не вдалося змінити пароль'); return }
    setCreated({ login: user.login, password: json.password })
  }

  const toggleActive = async (user: AdminUser) => {
    setError('')
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowIndex: user.rowIndex,
        action: user.active ? 'deactivate' : 'activate',
      }),
    })
    if (!res.ok) { setError('Не вдалося змінити доступ'); return }
    await load()
  }

  return (
    <>
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Додати майстриню</h3>
        <p className={styles.cardDesc}>
          Пароль згенерується автоматично — покажемо його один раз, передайте його майстрині
        </p>

        <div className={styles.indivForm}>
          <div className={styles.indivRow}>
            <div className={styles.indivField}>
              <label className={styles.indivLabel}>Ім&apos;я</label>
              <input
                className={styles.indivInput}
                placeholder="Анна"
                value={name}
                onChange={(e) => { setName(e.target.value); setCreated(null) }}
              />
            </div>
            <div className={styles.indivField}>
              <label className={styles.indivLabel}>Логін</label>
              <input
                className={styles.indivInput}
                placeholder="anna"
                autoCapitalize="none"
                value={login}
                onChange={(e) => { setLogin(e.target.value); setCreated(null) }}
              />
            </div>
          </div>

          <div className={styles.indivField}>
            <label className={styles.indivLabel}>Студія</label>
            <select
              className={styles.indivSelect}
              value={userStudio}
              onChange={(e) => setUserStudio(e.target.value)}
            >
              {STUDIOS_LIST.map((s) => <option key={s.id} value={s.id}>{s.city}</option>)}
            </select>
          </div>

          {error && <p className={styles.empty} style={{ color: '#c00' }}>{error}</p>}

          <button className={styles.generateBtn} disabled={creating} onClick={create}>
            {creating ? 'Створюємо…' : 'Створити доступ'}
          </button>

          {created && (
            <div className={styles.generatedBlock}>
              <p className={styles.generatedLabel}>
                Логін <b>{created.login}</b> — пароль показується лише зараз:
              </p>
              <div className={styles.linkRow}>
                <span className={styles.link} style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                  {created.password}
                </span>
                <CopyButton text={created.password} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Хто має доступ</h3>
        {loading && <p className={styles.empty}>Завантаження…</p>}
        {!loading && users.length === 0 && (
          <p className={styles.empty}>Поки нікого. Ви заходите через обліковий запис із налаштувань сервера.</p>
        )}

        <div className={styles.slotList}>
          {users.map((user) => (
            <div key={user.rowIndex} className={styles.slotRow}>
              <div className={styles.slotInfo}>
                <span className={styles.slotTitle}>{user.name || user.login}</span>
                <span className={styles.slotDate}>{user.login}</span>
                <span className={styles.slotTime}>
                  {user.role === 'admin'
                    ? 'адміністратор'
                    : STUDIOS_LIST.find((s) => s.id === user.studio)?.city ?? 'без студії'}
                </span>
                {!user.active && <span className={styles.slotSpots}>доступ вимкнено</span>}
              </div>
              <div className={styles.linkRow}>
                <button className={styles.copyBtn} onClick={() => resetPassword(user)}>
                  Новий пароль
                </button>
                <button className={styles.copyBtn} onClick={() => toggleActive(user)}>
                  {user.active ? 'Вимкнути' : 'Увімкнути'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
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
        {activeMenu === 'certificate' && <CertificateContent studio={studio} origin={origin} />}
        {activeMenu === 'promo'       && <PromoContent studio={studio} />}
        {activeMenu === 'users'       && <UsersContent studio={studio} />}
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
      <div className={styles.topBar}>
        <a href="/master" className={styles.topLink}>Кабінет майстрині</a>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={styles.topLink}>Вийти</button>
        </form>
      </div>

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
