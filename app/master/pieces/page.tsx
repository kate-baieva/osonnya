import PiecesScreen from '@/components/PiecesScreen'
import { getSession } from '@/lib/session'
import styles from '../master.module.css'

export const dynamic = 'force-dynamic'

export default async function MasterPiecesPage() {
  const session = await getSession()
  const isAdmin = session?.role === 'admin'

  return (
    <>
      <h1 className={styles.pageTitle}>Вироби</h1>
      <PiecesScreen
        studio={session?.studio ?? 'sumy'}
        canSwitchStudio={isAdmin}
      />
    </>
  )
}
