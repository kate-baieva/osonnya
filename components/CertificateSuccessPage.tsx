'use client'

import { useSearchParams } from 'next/navigation'
import { STUDIOS } from '@/lib/studios'
import styles from './CertificateSuccessPage.module.css'

export default function CertificateSuccessPage({ studioId }: { studioId: string }) {
  const searchParams = useSearchParams()
  const code  = searchParams.get('code') ?? ''
  const studio = STUDIOS[studioId]

  // Розраховуємо дату закінчення (3 місяці від сьогодні — момент оплати)
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 3)
  const expiresStr = expiresAt.toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />

      <div className={styles.card}>
        <div className={styles.icon}>🎁</div>

        <h1 className={styles.heading}>
          Дякуємо! Сертифікат успішно оформлено
        </h1>

        <p className={styles.sub}>
          Ваш подарунковий сертифікат від {studio?.name}
        </p>

        <div className={styles.codeBlock}>
          <span className={styles.codeLabel}>Номер сертифіката</span>
          <span className={styles.code}>{code}</span>
        </div>

        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Дійсний до</span>
            <span className={styles.detailValue}>{expiresStr}</span>
          </div>
        </div>

        <p className={styles.hint}>
          Збережіть номер сертифіката — він знадобиться при бронюванні майстер-класу.
          Вкажіть його у формі запису в полі «Сертифікат».
        </p>

        <a href={studio?.basePath ?? '/'} className={styles.btn}>
          Переглянути розклад майстер-класів
        </a>
      </div>
    </main>
  )
}
