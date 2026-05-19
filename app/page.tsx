import styles from './home.module.css'

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <h1 className={styles.heading}>Вітаємо вас в Осонні!</h1>
        <p className={styles.text}>
          Тут ви можете зареєструватися на групові майстер-класи в наших студіях.
          Оберіть, будь ласка, ваше місто.
        </p>
      </header>

      <div className={styles.cards}>
        <a href="/sumy" className={styles.card}>
          <div
            className={styles.cardImage}
            style={{ backgroundImage: 'url(/photo-sumy.jpg)' }}
          />
          <div className={styles.cardFooter}>
            <span className={styles.cardBtn}>Записатись</span>
          </div>
        </a>

        <a href="/if" className={styles.card}>
          <div
            className={styles.cardImage}
            style={{ backgroundImage: 'url(/photo-if.jpg)' }}
          />
          <div className={styles.cardFooter}>
            <span className={styles.cardBtn}>Записатись</span>
          </div>
        </a>
      </div>
    </main>
  )
}
