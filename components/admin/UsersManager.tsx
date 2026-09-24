'use client'

import { useCallback, useEffect, useState } from 'react'
import { STUDIOS } from '@/lib/studios'
import CopyButton from '../CopyButton'
import ui from '../ui.module.css'

const STUDIO_LIST = [STUDIOS.sumy, STUDIOS.if]

interface AdminUser {
  rowIndex: number
  name: string
  login: string
  role: 'admin' | 'master'
  studio: string | null
  active: boolean
}

export default function UsersManager() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [login, setLogin] = useState('')
  const [studioId, setStudioId] = useState('sumy')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
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

  const create = async () => {
    setError('')
    setCreated(null)
    setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, login, role: 'master', studio: studioId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Не вдалося створити'); return }
      setCreated({ login: json.login, password: json.password })
      setName('')
      setLogin('')
      await load()
    } catch {
      setError("Немає з'єднання. Спробуйте ще раз.")
    } finally {
      setCreating(false)
    }
  }

  const patch = async (rowIndex: number, action: string) => {
    setError('')
    setCreated(null)
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex, action }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Не вдалося зберегти зміни'); return }
    if (json.password) {
      const user = users.find((u) => u.rowIndex === rowIndex)
      setCreated({ login: user?.login ?? '', password: json.password })
    }
    await load()
  }

  return (
    <>
      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Додати майстриню</h2>
        <p className={ui.cardDesc}>
          Пароль згенерується автоматично — покажемо його один раз, передайте його майстрині
        </p>

        <div className={ui.formGrid}>
          <div className={ui.field}>
            <label className={ui.label}>Ім&apos;я</label>
            <input
              className={ui.input} placeholder="Аня" value={name}
              onChange={(e) => { setName(e.target.value); setCreated(null) }}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Логін</label>
            <input
              className={ui.input} placeholder="ania" autoCapitalize="none" value={login}
              onChange={(e) => { setLogin(e.target.value); setCreated(null) }}
            />
          </div>
          <div className={`${ui.field} ${ui.fieldWide}`}>
            <label className={ui.label}>Студія</label>
            <select
              className={ui.selectInput} value={studioId}
              onChange={(e) => setStudioId(e.target.value)}
            >
              {STUDIO_LIST.map((s) => <option key={s.id} value={s.id}>{s.city}</option>)}
            </select>
          </div>
        </div>

        {error && <p className={ui.error} style={{ marginTop: 14 }}>{error}</p>}

        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          style={{ marginTop: 15 }}
          disabled={creating}
          onClick={create}
        >
          {creating ? 'Створюємо…' : 'Створити доступ'}
        </button>

        {created && (
          <div className={ui.resultBox}>
            <p className={ui.resultLabel}>
              Логін <b>{created.login}</b> — пароль показується лише зараз:
            </p>
            <div className={ui.linkRow}>
              <span className={`${ui.linkText} ${ui.codeText}`}>{created.password}</span>
              <CopyButton text={created.password} />
            </div>
          </div>
        )}
      </section>

      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Хто має доступ</h2>

        {loading && <p className={ui.empty}>Завантаження…</p>}
        {!loading && users.length === 0 && (
          <p className={ui.empty}>
            Поки нікого. Ви заходите через обліковий запис із налаштувань сервера.
          </p>
        )}

        {users.length > 0 && (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr><th>Ім&apos;я</th><th>Логін</th><th>Студія</th><th>Статус</th><th /></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.rowIndex}>
                    <td>{user.name || '—'}</td>
                    <td>{user.login}</td>
                    <td>
                      {user.role === 'admin'
                        ? 'адміністратор'
                        : STUDIO_LIST.find((s) => s.id === user.studio)?.city ?? 'без студії'}
                    </td>
                    <td>
                      <span className={`${ui.pill} ${user.active ? ui.pillOk : ui.pillMuted}`}>
                        {user.active ? 'активна' : 'вимкнено'}
                      </span>
                    </td>
                    <td>
                      <div className={ui.rowActions}>
                        <button
                          className={`${ui.btn} ${ui.btnSmall}`}
                          onClick={() => patch(user.rowIndex, 'reset-password')}
                        >Новий пароль</button>
                        <button
                          className={`${ui.btn} ${ui.btnSmall}`}
                          onClick={() => patch(user.rowIndex, user.active ? 'deactivate' : 'activate')}
                        >{user.active ? 'Вимкнути' : 'Увімкнути'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
