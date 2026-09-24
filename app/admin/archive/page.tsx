import Link from 'next/link'
import ScheduleScreen from '@/components/ScheduleScreen'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default function AdminArchivePage() {
  return (
    <>
      <Link href="/admin" className={ui.backLink}>← Назад до розкладу</Link>
      <ScheduleScreen past />
    </>
  )
}
