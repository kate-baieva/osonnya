import PiecesScreen from '@/components/PiecesScreen'
import { getSession } from '@/lib/session'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default async function MasterPiecesPage() {
  const session = await getSession()
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Вироби</h1>
          <p className={ui.sub}>Робочий список. Те, що старше чотирьох місяців, лежить в архіві.</p>
        </div>
        <a className={ui.btn} href="/master/pieces/archive">Архів виробів</a>
      </div>
      <PiecesScreen studio={session?.studio ?? 'sumy'} canSwitchStudio={false} />
    </>
  )
}
