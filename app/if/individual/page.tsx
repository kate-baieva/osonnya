import { Suspense } from 'react'
import IndividualBookingPage from '@/components/IndividualBookingPage'

export default function IfIndividualPage() {
  return (
    <Suspense>
      <IndividualBookingPage studioId="if" />
    </Suspense>
  )
}
