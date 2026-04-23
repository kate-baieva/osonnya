import styles from './success.module.css'

export default function SuccessPage() {
  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1>Оплату отримано!</h1>
        <p>Ваш запис підтверджено. Ми зв'яжемося з вами найближчим часом.</p>
        <a href="/" className={styles.btn}>На головну</a>
      </div>
    </main>
  )
}
