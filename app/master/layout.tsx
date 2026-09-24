import Link from 'next/link'
import { getSession } from '@/lib/session'
import { STUDIOS } from '@/lib/studios'
import styles from './master.module.css'

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const studio = session?.studio ? STUDIOS[session.studio] : null

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        <div className={styles.who}>
          <span className={styles.name}>{session?.name ?? ''}</span>
          <span className={styles.studio}>
            {studio ? studio.city : 'Обидві студії'}
          </span>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={styles.logout}>Вийти</button>
        </form>
      </header>

      <nav className={styles.nav}>
        <Link href="/master" className={styles.navLink}>Головна</Link>
        <Link href="/master/pieces" className={styles.navLink}>Вироби</Link>
      </nav>

      {children}
    </div>
  )
}
