import { Suspense } from 'react'
import ServicePaymentPage from '@/components/ServicePaymentPage'

export default function SumyServicePage() {
  return (
    <Suspense>
      <ServicePaymentPage studioId="sumy" />
    </Suspense>
  )
}
