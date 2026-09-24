import PiecesScreen from '@/components/PiecesScreen'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default function AdminPiecesPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Вироби</h1>
          <p className={ui.sub}>По обох студіях, з фільтрами за статусом.</p>
        </div>
      </div>
      <PiecesScreen studio="sumy" canSwitchStudio />
    </>
  )
}
