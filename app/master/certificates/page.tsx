import CertificatesScreen from '@/components/CertificatesScreen'
import { getSession } from '@/lib/session'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default async function MasterCertificatesPage() {
  const session = await getSession()
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Сертифікати</h1>
          <p className={ui.sub}>Видати в студії або віддати вже оплачений паперовий.</p>
        </div>
      </div>
      <CertificatesScreen studioId={session?.studio ?? 'sumy'} canSwitchStudio={false} />
    </>
  )
}
