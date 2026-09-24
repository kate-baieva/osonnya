import PromoForm from '@/components/admin/PromoForm'
import ui from '@/components/ui.module.css'

export default function AdminPromoPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Промокоди</h1>
          <p className={ui.sub}>Разова знижка для клієнтів.</p>
        </div>
      </div>
      <PromoForm />
    </>
  )
}
