import ServiceForm from '@/components/admin/ServiceForm'
import ui from '@/components/ui.module.css'

export default function AdminServicesPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Оплата послуг</h1>
          <p className={ui.sub}>
            Посилання на оплату того, що не є майстер-класом. Після оплати рядок
            сам з&apos;являється в аркуші «Other Orders».
          </p>
        </div>
      </div>
      <ServiceForm />
    </>
  )
}
