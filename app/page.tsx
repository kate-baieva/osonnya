import styles from './home.module.css'

export default function HomePage() {
  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
      <h1 className={styles.heading}>Вітаємо вас в Осонні!</h1>
      <p className={styles.text}>
        Тут ви можете зареєструватися на групові майстер-класи в наших студіях.
        Оберіть, будь ласка, ваше місто.
      </p>
      <div className={styles.buttons}>
        <a href="/sumy" className={styles.btn}>Суми</a>
        <a href="/if" className={styles.btn}>Івано-Франківськ</a>
      </div>
    </main>
  )
}
