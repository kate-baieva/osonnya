import CertificateForm from '@/components/admin/CertificateForm'
import ui from '@/components/ui.module.css'

export default function AdminCertificatesPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Сертифікати</h1>
          <p className={ui.sub}>Створити посилання для продажу онлайн.</p>
        </div>
      </div>
      <CertificateForm />
    </>
  )
}
