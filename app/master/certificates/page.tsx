import ui from '@/components/ui.module.css'

export default function MasterCertificatesPage() {
  return (
    <>
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <h1 className={ui.title}>Сертифікати</h1>
          <p className={ui.sub}>Видати в студії або віддати вже оплачений паперовий.</p>
        </div>
      </div>
      <div className={ui.hint}>
        <b>Наступний крок розробки</b>
        Тут зʼявиться список тих, хто має зайти за паперовим сертифікатом, і форма продажу в студії.
      </div>
    </>
  )
}
