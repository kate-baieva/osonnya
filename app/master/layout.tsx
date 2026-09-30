import AppShell from '@/components/AppShell'
import { requirePage } from '@/lib/session'
import { navFor } from '@/lib/nav'
import { STUDIOS } from '@/lib/studios'

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePage()
  const studio = session?.studio ? STUDIOS[session.studio] : null

  return (
    <AppShell
      nav={navFor('master')}
      name={session?.name ?? ''}
      studioLabel={studio ? studio.city : 'Обидві студії'}
    >
      {children}
    </AppShell>
  )
}
