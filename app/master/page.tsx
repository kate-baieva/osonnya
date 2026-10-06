import Link from 'next/link'
import MasterSchedule from '@/components/MasterSchedule'
import { getSession } from '@/lib/session'
import { getPieces } from '@/lib/pieces'
import ui from '@/components/ui.module.css'
import styles from './master.module.css'

export const dynamic = 'force-dynamic'

const WAIT_DAYS = 14

function parseSheetDate(raw: string): number {
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) {
    const [, month, day, year] = mdy
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime()
  }
  const parsed = new Date(raw.replace(' ', 'T')).getTime()
  return isNaN(parsed) ? 0 : parsed
}

export default async function MasterHome() {
  const session = await getSession()
  const studioId = session?.studio ?? 'sumy'

  let raw = 0
  let bisque = 0
  let glazing = 0
  let ready = 0
  let readyToFire = 0
  let failed = false

  try {
    for (const piece of await getPieces(studioId)) {
      if (piece.status === 'Невипалений') {
        raw++
        const time = parseSheetDate(piece.mkDate)
        if (time && Date.now() - time >= WAIT_DAYS * 86400000) readyToFire++
      }
      if (piece.status === 'Утіль') bisque++
      if (piece.status === 'Глазурується') glazing++
      if (piece.status === 'Готово') ready++
    }
  } catch {
    failed = true
  }

  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Головна</h1>
          <p className={ui.sub}>Спершу розклад, нижче — що чекає в печі.</p>
        </div>
      </div>

      <MasterSchedule masterName={session?.name ?? ''} studioId={studioId} />

      <h2 className={ui.cardTitle} style={{ fontSize: 18, marginBottom: 12 }}>Вироби</h2>

      {failed ? (
        <p className={ui.empty}>Не вдалося завантажити вироби. Спробуйте оновити сторінку.</p>
      ) : (
        <div className={styles.tiles}>
          <Link href="/master/pieces" className={`${styles.tile} ${readyToFire > 0 ? styles.tileAccent : ''}`}>
            <span className={styles.tileValue}>{readyToFire}</span>
            <span className={styles.tileLabel}>Готові до утілю</span>
            <span className={styles.tileHint}>лежать 2+ тижні</span>
          </Link>

          <Link href="/master/pieces" className={styles.tile}>
            <span className={styles.tileValue}>{raw}</span>
            <span className={styles.tileLabel}>Невипалені</span>
            <span className={styles.tileHint}>усього чекає</span>
          </Link>

          <Link href="/master/pieces" className={styles.tile}>
            <span className={styles.tileValue}>{bisque}</span>
            <span className={styles.tileLabel}>Утіль</span>
            <span className={styles.tileHint}>чекає на глазур</span>
          </Link>

          <Link href="/master/pieces" className={styles.tile}>
            <span className={styles.tileValue}>{glazing}</span>
            <span className={styles.tileLabel}>Глазурується</span>
            <span className={styles.tileHint}>у другому випалі</span>
          </Link>

          <Link href="/master/pieces" className={styles.tile}>
            <span className={styles.tileValue}>{ready}</span>
            <span className={styles.tileLabel}>Готово</span>
            <span className={styles.tileHint}>чекає, щоб забрали</span>
          </Link>
        </div>
      )}
    </>
  )
}
