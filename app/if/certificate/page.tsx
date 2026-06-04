import { Suspense } from 'react'
import CertificatePurchasePage from '@/components/CertificatePurchasePage'

export default function IfCertificatePage() {
  return <Suspense><CertificatePurchasePage studioId="if" /></Suspense>
}
