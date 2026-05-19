import { Suspense } from 'react'
import BookingPage from '@/components/BookingPage'

export default function IFPage() {
  return (
    <Suspense>
      <BookingPage studioId="if" />
    </Suspense>
  )
}
