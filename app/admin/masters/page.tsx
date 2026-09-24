import UsersManager from '@/components/admin/UsersManager'
import ui from '@/components/ui.module.css'

export default function AdminMastersPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Майстрині</h1>
          <p className={ui.sub}>Доступ до кабінету. Пароль показується один раз — далі тільки перевипуск.</p>
        </div>
      </div>
      <UsersManager />
    </>
  )
}
