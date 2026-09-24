import type { Role } from './auth'

export interface NavItem {
  href: string
  label: string
  icon: string // вміст <svg viewBox="0 0 20 20">
  group: 'main' | 'bottom'
  danger?: boolean
}

const ICONS = {
  calendar: '<rect x="2.5" y="3.5" width="15" height="14" rx="2"/><path d="M2.5 8h15M7 2v3M13 2v3"/>',
  person: '<circle cx="10" cy="7" r="3"/><path d="M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5"/>',
  certificate: '<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M2.5 9h15M6 12.5h3"/>',
  tag: '<path d="M10.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v6.5L10 17.5l7.5-7.5-7-7.5z"/><circle cx="6.5" cy="6.5" r="1"/>',
  pot: '<path d="M7 2.5h6l-1 3 2.5 3.5v6a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-6L8 5.5z"/>',
  people: '<circle cx="7" cy="7" r="2.5"/><path d="M2 16c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/><path d="M13 5.5a2.5 2.5 0 0 1 0 5M14.5 16c0-2-.6-3.4-1.7-4.2"/>',
  gear: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/>',
  exit: '<path d="M12 6V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 4 4v12a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 12 16v-2"/><path d="M8.5 10h9m0 0-2.5-2.5M17.5 10 15 12.5"/>',
}

const ADMIN_NAV: NavItem[] = [
  { href: '/admin',              label: 'Головна',              icon: ICONS.calendar,    group: 'main' },
  { href: '/admin/individual',   label: 'Індивідуальний МК',    icon: ICONS.person,      group: 'main' },
  { href: '/admin/certificates', label: 'Сертифікат',           icon: ICONS.certificate, group: 'main' },
  { href: '/admin/promo',        label: 'Промокод',             icon: ICONS.tag,         group: 'main' },
  { href: '/admin/pieces',       label: 'Вироби',               icon: ICONS.pot,         group: 'main' },
  { href: '/admin/masters',      label: 'Майстрині',            icon: ICONS.people,      group: 'bottom' },
  { href: '/admin/profile',      label: 'Налаштування профілю', icon: ICONS.gear,        group: 'bottom' },
]

const MASTER_NAV: NavItem[] = [
  { href: '/master',              label: 'Головна',              icon: ICONS.calendar,    group: 'main' },
  { href: '/master/certificates', label: 'Сертифікат',           icon: ICONS.certificate, group: 'main' },
  { href: '/master/pieces',       label: 'Вироби',               icon: ICONS.pot,         group: 'main' },
  { href: '/master/profile',      label: 'Налаштування профілю', icon: ICONS.gear,        group: 'bottom' },
]

export function navFor(role: Role): NavItem[] {
  return role === 'admin' ? ADMIN_NAV : MASTER_NAV
}

export const LOGOUT_ICON = ICONS.exit
