import PiecesScreen from '@/components/PiecesScreen'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default function AdminPiecesPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Вироби</h1>
          <p className={ui.sub}>По обох студіях. Те, що старше чотирьох місяців, лежить в архіві.</p>
        </div>
        <a className={ui.btn} href="/admin/pieces/archive">Архів виробів</a>
      </div>
      <PiecesScreen studio="sumy" canSwitchStudio />
    </>
  )
}
