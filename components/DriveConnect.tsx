'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ui from './ui.module.css'

const MESSAGES: Record<string, { text: string; bad?: boolean }> = {
  ok: { text: 'Google Drive під\'єднано — фото виробів тепер завантажуються.' },
  denied: { text: 'Доступ не надано. Без нього фото не завантажуватимуться.', bad: true },
  noref: {
    text: 'Google не віддав постійний доступ. Відкрийте google.com/permissions, '
      + 'приберіть звідти Osonnya і спробуйте під\'єднати ще раз.',
    bad: true,
  },
  error: { text: 'Не вдалося під\'єднати. Спробуйте ще раз.', bad: true },
}

export default function DriveConnect() {
  const params = useSearchParams()
  const [state, setState] = useState<{ configured: boolean; connected: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/drive/status')
      if (res.ok) setState(await res.json())
    } catch {
      setState(null)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const message = MESSAGES[params.get('drive') ?? '']

  return (
    <section className={ui.card}>
      <h2 className={ui.cardTitle}>Google Drive для фото</h2>
      <p className={ui.cardDesc}>
        Фото виробів зберігаються у ваших папках на Drive і завантажуються від вашого імені
      </p>

      {message && (
        <p className={message.bad ? ui.error : undefined} style={
          message.bad ? undefined : { background: '#e4efe3', color: '#4a7c4e', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, marginBottom: 14 }
        }>{message.text}</p>
      )}

      {state === null && <p className={ui.empty}>Перевіряємо…</p>}

      {state && !state.configured && (
        <div className={ui.hint}>
          <b>Ще не налаштовано на сервері</b>
          Потрібні GOOGLE_OAUTH_CLIENT_ID і GOOGLE_OAUTH_CLIENT_SECRET у налаштуваннях застосунку.
        </div>
      )}

      {state?.configured && (
        state.connected ? (
          <>
            <p className={ui.sub} style={{ marginBottom: 14 }}>
              Під&apos;єднано. Завантаження фото працює.
            </p>
            <button
              className={ui.btn}
              onClick={async () => {
                await fetch('/api/drive/status', { method: 'DELETE' })
                await load()
              }}
            >Від&apos;єднати</button>
          </>
        ) : (
          <a className={`${ui.btn} ${ui.btnPrimary}`} href="/api/drive/connect">
            Під&apos;єднати Google Drive
          </a>
        )
      )}
    </section>
  )
}
