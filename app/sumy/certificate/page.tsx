import { Suspense } from 'react'
import CertificatePurchasePage from '@/components/CertificatePurchasePage'

export default function SumyCertificatePage() {
  return <Suspense><CertificatePurchasePage studioId="sumy" /></Suspense>
}
