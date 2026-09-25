import MkScreen from '@/components/MkScreen'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function MasterMkPage({
  searchParams,
}: {
  searchParams: { at?: string }
}) {
  const session = await getSession()
  return (
    <MkScreen
      studioId={session?.studio ?? 'sumy'}
      mkKey={searchParams.at ?? ''}
      backHref="/master"
    />
  )
}
