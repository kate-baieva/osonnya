import styles from '@/app/success/success.module.css'

export default function IFSuccessPage() {
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
          <strong>місто Івано-Франківськ, вулиця Нацгвардії, 14Ю (ЖК «Паркове містечко»)</strong>
        </p>
        <p className={styles.locationText}>
          У збережених історіях «Локація» на нашій сторінці в інстаграм ви знайдете більше деталей,
          як знайти вхід до студії.
        </p>
        <a
          href="https://www.instagram.com/osonnya.ceramics.if/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.igLink}
        >
          Відкрити локацію в Instagram →
        </a>
        <a href="/if" className={styles.btn}>На головну</a>
      </div>
    </main>
  )
}
