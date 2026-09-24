import Link from 'next/link'
import { getSession } from '@/lib/session'
import { getPieces } from '@/lib/pieces'
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
  let readyToFire = 0
  let failed = false

  try {
    const pieces = await getPieces(studioId)
    for (const piece of pieces) {
      if (piece.status === 'Невипалений') {
        raw++
        const time = parseSheetDate(piece.mkDate)
        if (time && Date.now() - time >= WAIT_DAYS * 86400000) readyToFire++
      }
      if (piece.status === 'Утіль') bisque++
      if (piece.status === 'Глазурується') glazing++
    }
  } catch {
    failed = true
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Що зараз у роботі</h1>

      {failed ? (
        <p className={styles.soon}>Не вдалося завантажити вироби. Спробуйте оновити сторінку.</p>
      ) : (
        <div className={styles.tiles}>
          <Link href="/master/pieces" className={`${styles.tile} ${readyToFire > 0 ? styles.tileAccent : ''}`}>
            <span className={styles.tileValue}>{readyToFire}</span>
            <span className={styles.tileLabel}>Готові до утілю</span>
            <span className={styles.tileHint}>висохли, лежать 2+ тижні</span>
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
        </div>
      )}

      <div className={styles.soon}>
        <b>Далі буде тут</b>
        Майстер-класи, призначені на тебе, звірка списку учасників і роздача виробів —
        наступний крок розробки. Поки що всі вироби на сторінці «Вироби».
      </div>
    </>
  )
}
