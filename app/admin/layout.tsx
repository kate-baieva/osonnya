import AppShell from '@/components/AppShell'
import { getSession } from '@/lib/session'
import { navFor } from '@/lib/nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <AppShell
      nav={navFor('admin')}
      name={session?.name ?? 'Адміністратор'}
      studioLabel="Обидві студії"
    >
      {children}
    </AppShell>
  )
}
