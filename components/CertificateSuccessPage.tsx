'use client'

import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { STUDIOS } from '@/lib/studios'
import styles from './CertificateSuccessPage.module.css'

// Завантажуємо canvas-компонент тільки на клієнті (Canvas API недоступний на сервері)
const CertificateDigital = dynamic(() => import('./CertificateDigital'), { ssr: false })

const PAPER_INFO: Record<string, { address: string; instagram: string; instagramUrl: string }> = {
  sumy: {
    address: 'місто Суми, проспект Свободи, 14',
    instagram: '@osonnya.ceramics',
    instagramUrl: 'https://www.instagram.com/osonnya.ceramics/',
  },
  if: {
    address: 'місто Івано-Франківськ, вулиця Національної гвардії, 14Ю (ЖК "Паркове містечко")',
    instagram: '@osonnya.ceramics.if',
    instagramUrl: 'https://www.instagram.com/osonnya.ceramics.if/',
  },
}

export default function CertificateSuccessPage({ studioId }: { studioId: string }) {
  const searchParams = useSearchParams()
  const code       = searchParams.get('code') ?? ''
  const certType   = searchParams.get('type') ?? 'paper'
  const mkLabel    = searchParams.get('mk') ?? ''
  const peopleCount = Number(searchParams.get('count') ?? '1')
  const studio     = STUDIOS[studioId]
  const paper      = PAPER_INFO[studioId]

  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 3)
  const expiresStr = expiresAt.toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const instagram = studio?.instagramHandle ?? '@osonnya.ceramics'

  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />

      <div className={styles.card}>
        <div className={styles.icon}>🎁</div>

        <h1 className={styles.heading}>
          Дякуємо! Сертифікат успішно оформлено
        </h1>

        <p className={styles.sub}>
          Ваш {certType === 'paper' ? 'паперовий' : 'електронний'} подарунковий сертифікат від {studio?.name}
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

        {/* Паперовий сертифікат — інформація про самовивіз */}
        {certType === 'paper' && paper && (
          <div className={styles.paperInfo}>
            <p>
              Ваш паперовий сертифікат вже очікує на вас в нашій студії за адресою{' '}
              <strong>{paper.address}</strong>. Наш менеджер найближчим часом зв'яжеться
              з вами та повідомить точні години роботи студії, коли можна забрати сертифікат.
            </p>
            <p>
              У випадку виникнення додаткових питань – напишіть нам на нашу сторінку в
              Інстаграм –{' '}
              <a href={paper.instagramUrl} target="_blank" rel="noopener noreferrer"
                className={styles.igLink}>
                {paper.instagramUrl}
              </a>
            </p>
          </div>
        )}

        {/* Електронний сертифікат — зображення для скачування */}
        {certType === 'digital' && mkLabel && (
          <div className={styles.digitalBlock}>
            <CertificateDigital
              certCode={code}
              mkLabel={mkLabel}
              peopleCount={peopleCount}
              expiresAt={expiresAt}
              instagram={instagram}
            />
          </div>
        )}

        <a href={studio?.basePath ?? '/'} className={styles.btn}>
          Переглянути розклад майстер-класів
        </a>
      </div>
    </main>
  )
}
