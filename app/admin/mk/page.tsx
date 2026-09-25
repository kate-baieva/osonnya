import MkScreen from '@/components/MkScreen'

export const dynamic = 'force-dynamic'

export default function AdminMkPage({
  searchParams,
}: {
  searchParams: { studio?: string; at?: string }
}) {
  return (
    <MkScreen
      studioId={searchParams.studio ?? 'sumy'}
      mkKey={searchParams.at ?? ''}
      backHref="/admin"
    />
  )
}
