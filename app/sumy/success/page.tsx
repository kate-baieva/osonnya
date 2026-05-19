import styles from '@/app/success/success.module.css'

export default function SumySuccessPage() {
  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1 className={styles.heading}>
          Дякуємо за реєстрацію на майстер-клас!<br />
          Із нетерпінням чекаємо на вас в Осонні
        </h1>
        <p className={styles.address}>
          Студія «Осоння» знаходиться за адресою:<br />
          <strong>місто Суми, проспект Свободи, 14</strong>
        </p>
        <p className={styles.locationText}>
          У збережених історіях «Локація» на нашій сторінці в інстаграм ви знайдете більше деталей,
          як знайти вхід до студії.
        </p>
        <a
          href="https://www.instagram.com/stories/highlights/18321951592248393/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.igLink}
        >
          Відкрити локацію в Instagram →
        </a>
        <a href="/sumy" className={styles.btn}>На головну</a>
      </div>
    </main>
  )
}
