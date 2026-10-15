import { Suspense } from 'react'
import ServicePaymentPage from '@/components/ServicePaymentPage'

export default function IfServicePage() {
  return (
    <Suspense>
      <ServicePaymentPage studioId="if" />
    </Suspense>
  )
}
