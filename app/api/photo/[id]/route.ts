import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPhoto } from '@/lib/drive'

// Фото лишаються приватними на Drive — застосунок віддає їх лише тим, хто увійшов.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return new NextResponse('Потрібен вхід', { status: 401 })

  if (!/^[A-Za-z0-9_-]{20,}$/.test(params.id)) {
    return new NextResponse('Некоректний ідентифікатор', { status: 400 })
  }

  try {
    const { body, mimeType } = await getPhoto(params.id)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('[api/photo]', error)
    return new NextResponse('Фото недоступне', { status: 404 })
  }
}
