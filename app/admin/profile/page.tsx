import { Suspense } from 'react'
import ProfileScreen from '@/components/ProfileScreen'
import DriveConnect from '@/components/DriveConnect'
import { getSession } from '@/lib/session'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default async function AdminProfilePage() {
  const session = await getSession()
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Налаштування профілю</h1>
          <p className={ui.sub}>Ваш обліковий запис і під&apos;єднані сервіси.</p>
        </div>
      </div>

      <Suspense fallback={null}>
        <DriveConnect />
      </Suspense>

      <ProfileScreen
        name={session?.name ?? ''}
        login={session?.login ?? ''}
        roleLabel="Адміністратор · обидві студії"
      />
    </>
  )
}
