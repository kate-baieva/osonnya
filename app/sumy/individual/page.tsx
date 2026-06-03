import { Suspense } from 'react'
import IndividualBookingPage from '@/components/IndividualBookingPage'

export default function SumyIndividualPage() {
  return (
    <Suspense>
      <IndividualBookingPage studioId="sumy" />
    </Suspense>
  )
}
