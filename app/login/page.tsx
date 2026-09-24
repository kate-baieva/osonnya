'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './login.module.css'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Не вдалося увійти')
        return
      }
      const next = searchParams.get('next')
      router.replace(next ?? (json.role === 'admin' ? '/admin' : '/master'))
      router.refresh()
    } catch {
      setError("Немає з'єднання. Спробуйте ще раз.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login">Логін</label>
        <input
          id="login"
          className={styles.input}
          value={login}
          autoComplete="username"
          autoCapitalize="none"
          onChange={(e) => setLogin(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">Пароль</label>
        <input
          id="password"
          type="password"
          className={styles.input}
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button type="submit" className={styles.submit} disabled={submitting}>
        {submitting ? 'Заходимо…' : 'Увійти'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <h1 className={styles.title}>Вхід</h1>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
