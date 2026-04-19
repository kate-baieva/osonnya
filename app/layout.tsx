import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Запис на майстер-клас',
  description: 'Оберіть зручний час і запишіться на груповий майстер-клас з кераміки',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  )
}
