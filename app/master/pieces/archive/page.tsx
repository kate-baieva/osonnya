import Link from 'next/link'
import PiecesScreen from '@/components/PiecesScreen'
import { getSession } from '@/lib/session'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default async function MasterPiecesArchivePage() {
  const session = await getSession()
  return (
    <>
      <Link href="/master/pieces" className={ui.backLink}>← Назад до виробів</Link>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Архів виробів</h1>
          <p className={ui.sub}>Усе, що старше чотирьох місяців.</p>
        </div>
      </div>
      <PiecesScreen studio={session?.studio ?? 'sumy'} canSwitchStudio={false} mode="archive" />
    </>
  )
}
