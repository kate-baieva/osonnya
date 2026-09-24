'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LOGOUT_ICON, type NavItem } from '@/lib/nav'
import styles from './AppShell.module.css'

function Icon({ path }: { path: string }) {
  return (
    <svg className={styles.navIcon} viewBox="0 0 20 20" dangerouslySetInnerHTML={{ __html: path }} />
  )
}

export default function AppShell({
  nav,
  name,
  studioLabel,
  children,
}: {
  nav: NavItem[]
  name: string
  studioLabel: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Найдовший збіг, щоб /admin не підсвічувався на /admin/pieces
  const activeHref = nav
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const title = nav.find((item) => item.href === activeHref)?.label ?? ''

  const renderGroup = (group: NavItem['group']) =>
    nav.filter((item) => item.group === group).map((item) => (
      <Link
        key={item.href}
        href={item.href}
        className={`${styles.navItem} ${item.href === activeHref ? styles.navItemActive : ''}`}
        onClick={() => setOpen(false)}
      >
        <Icon path={item.icon} />
        {item.label}
      </Link>
    ))

  return (
    <div className={`${styles.app} ${open ? styles.navOpen : ''}`}>
      <div className={styles.backdrop} onClick={() => setOpen(false)} />

      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/logo.svg" alt="Osonnya" className={styles.logo} />
        </div>
        <div className={styles.whoami}>
          <span className={styles.whoName}>{name}</span>
          {studioLabel}
        </div>

        <nav className={styles.navGroup}>{renderGroup('main')}</nav>

        <div className={styles.navSpacer} />
        <div className={styles.navDivider} />

        <nav className={styles.navGroup}>
          {renderGroup('bottom')}
          <form action="/api/auth/logout" method="post" className={styles.logoutForm}>
            <button type="submit" className={`${styles.navItem} ${styles.navItemDanger}`}>
              <Icon path={LOGOUT_ICON} />
              Вихід
            </button>
          </form>
        </nav>
      </aside>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <button className={styles.burger} onClick={() => setOpen(true)} aria-label="Меню">
            <svg width="19" height="19" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.8" fill="none">
              <path d="M3 5.5h14M3 10h14M3 14.5h14" />
            </svg>
          </button>
          <span className={styles.topbarTitle}>{title}</span>
        </div>

        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
