import styles from './LegalLinks.module.css'

// Один рядок правових посилань на всіх публічних сторінках. Раніше він
// був лише на головній, тож із форми запису до правил було не дістатись —
// а правила вимагають, щоб вони були саме на сторінці запису.
const LINKS = [
  { href: '/terms', label: 'Правила та умови' },
  { href: '/public-contract', label: 'Публічний договір' },
  { href: '/air-raid-rules', label: 'Правила роботи студій під час повітряних тривог' },
]

export default function LegalLinks() {
  return (
    <footer className={styles.footer}>
      {LINKS.map((link) => (
        <a key={link.href} href={link.href} className={styles.link}>
          {link.label}
        </a>
      ))}
    </footer>
  )
}
