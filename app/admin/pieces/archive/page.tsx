import Link from 'next/link'
import PiecesScreen from '@/components/PiecesScreen'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default function AdminPiecesArchivePage() {
  return (
    <>
      <Link href="/admin/pieces" className={ui.backLink}>← Назад до виробів</Link>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Архів виробів</h1>
          <p className={ui.sub}>Усе, що старше чотирьох місяців. Статус зберігається той, що був.</p>
        </div>
      </div>
      <PiecesScreen studio="sumy" canSwitchStudio mode="archive" />
    </>
  )
}
