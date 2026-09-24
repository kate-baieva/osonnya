import IndividualForm from '@/components/admin/IndividualForm'
import ui from '@/components/ui.module.css'

export default function AdminIndividualPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Індивідуальний МК</h1>
          <p className={ui.sub}>Створити слот під конкретного клієнта і отримати посилання для запису.</p>
        </div>
      </div>
      <IndividualForm />
    </>
  )
}
