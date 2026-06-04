import { Suspense } from 'react'
import CertificateSuccessPage from '@/components/CertificateSuccessPage'

export default function IfCertSuccessPage() {
  return <Suspense><CertificateSuccessPage studioId="if" /></Suspense>
}
