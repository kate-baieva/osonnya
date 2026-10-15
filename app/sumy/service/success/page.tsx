import styles from '@/app/success/success.module.css'
import LegalLinks from '@/components/LegalLinks'

export default function SumyServiceSuccessPage() {
  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1 className={styles.heading}>Дякуємо за оплату!</h1>
        <p className={styles.locationText}>
          Оплату прийнято. Якщо виникнуть питання, напишіть нам у дірект інстаграму —
          студія «Осоння», Суми.
        </p>
      </div>
      <LegalLinks />
    </main>
  )
}
