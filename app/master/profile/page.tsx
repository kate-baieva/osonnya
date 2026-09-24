import ProfileScreen from '@/components/ProfileScreen'
import { getSession } from '@/lib/session'
import { STUDIOS } from '@/lib/studios'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default async function MasterProfilePage() {
  const session = await getSession()
  const studio = session?.studio ? STUDIOS[session.studio] : null
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Налаштування профілю</h1>
          <p className={ui.sub}>Ваш власний обліковий запис.</p>
        </div>
      </div>
      <ProfileScreen
        name={session?.name ?? ''}
        login={session?.login ?? ''}
        roleLabel={studio ? `Майстриня · ${studio.city}` : 'Майстриня'}
      />
    </>
  )
}
