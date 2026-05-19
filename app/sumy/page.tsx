import { Suspense } from 'react'
import BookingPage from '@/components/BookingPage'

export default function SumyPage() {
  return (
    <Suspense>
      <BookingPage studioId="sumy" />
    </Suspense>
  )
}
