import CertificateForm from '@/components/admin/CertificateForm'
import CertificatesScreen from '@/components/CertificatesScreen'
import ui from '@/components/ui.module.css'

export const dynamic = 'force-dynamic'

export default function AdminCertificatesPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Сертифікати</h1>
          <p className={ui.sub}>Видати в студії, віддати оплачений паперовий або створити посилання для продажу онлайн.</p>
        </div>
      </div>

      <CertificatesScreen studioId="sumy" canSwitchStudio />
      <CertificateForm />
    </>
  )
}
