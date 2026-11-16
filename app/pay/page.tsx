import { decodeMkPaymentLink, readMkDebt } from '@/lib/mk-payment-link'
import { getStudio } from '@/lib/studios'
import { dateTimeLong, parseMkDatetime } from '@/lib/client-mail'
import MkAfterPay from '@/components/MkAfterPay'
import styles from '@/components/MkAfterPay.module.css'

// Сторінка доплати, на яку веде кнопка з листа-нагадування.
// Студія визначається самим посиланням, тож окремих /sumy та /if не треба.
//
// Сума рахується тут, на сервері, під час кожного відкриття: людина могла
// доплатити готівкою в студії вже після того, як лист пішов.

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Доплата за майстер-клас — Осоння' }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.main}>
      <img src="/logo.svg" alt="Осоння" className={styles.logo} />
      {children}
    </main>
  )
}

export default async function PayPage(
  { searchParams }: { searchParams: { d?: string } },
) {
  const link = decodeMkPaymentLink(searchParams.d ?? '')
  if (!link) {
    return (
      <Shell>
        <div className={styles.card}>
          <h1 className={styles.heading}>Посилання не працює</h1>
          <p className={styles.done}>
            Схоже, адресу скопійовано не повністю або посилання змінене.
            Напишіть нам у відповідь на лист — надішлемо нове.
          </p>
        </div>
      </Shell>
    )
  }

  const studio = getStudio(link.studio)
  let debt: Awaited<ReturnType<typeof readMkDebt>> = null
  try {
    debt = await readMkDebt(link)
  } catch (error) {
    console.error('[/pay] не вдалось прочитати запис:', error)
  }

  if (!studio || !debt) {
    return (
      <Shell>
        <div className={styles.card}>
          <h1 className={styles.heading}>Запис не знайдено</h1>
          <p className={styles.done}>
            Можливо, його скасували або перенесли. Напишіть нам — розберемось.
          </p>
        </div>
      </Shell>
    )
  }

  if (debt.due <= 0) {
    return (
      <Shell>
        <div className={styles.card}>
          <h1 className={styles.heading}>Усе вже сплачено</h1>
          <p className={styles.done}>
            За цим записом доплачувати нічого не потрібно. Чекаємо вас на
            майстер-класі!
          </p>
        </div>
      </Shell>
    )
  }

  const parsed = parseMkDatetime(debt.mkDatetime)
  const when = parsed ? dateTimeLong(parsed.date, parsed.time) : debt.mkDatetime

  return (
    <Shell>
      <MkAfterPay
        token={searchParams.d!}
        studioAddress={studio.address}
        info={{
          client: debt.client,
          when,
          people: debt.people,
          amount: debt.amount,
          paid: debt.paid,
          due: debt.due,
        }}
      />
    </Shell>
  )
}
