import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPieces, setPhoto } from '@/lib/pieces'
import { photoUrl, uploadPiecePhoto } from '@/lib/drive'
import { STUDIOS } from '@/lib/studios'

const MAX_BYTES = 12 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Потрібен вхід' }, { status: 401 })
  if (session.role !== 'admin' && !session.studio) {
    return NextResponse.json({ error: 'Студію не призначено' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Некоректний запит' }, { status: 400 })
  }

  const studioId = session.role === 'admin'
    ? String(form.get('studio') ?? '')
    : session.studio!
  if (!STUDIOS[studioId]) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }

  const rowIndex = Number(form.get('rowIndex'))
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    return NextResponse.json({ error: 'Невідомий виріб' }, { status: 400 })
  }

  const file = form.get('photo')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не надіслано' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Фото завелике — до 12 МБ' }, { status: 400 })
  }
  const mimeType = file.type || 'image/jpeg'
  if (!ALLOWED.includes(mimeType)) {
    return NextResponse.json({ error: 'Підтримуються лише зображення' }, { status: 400 })
  }

  try {
    const piece = (await getPieces(studioId)).find((p) => p.rowIndex === rowIndex)
    if (!piece) return NextResponse.json({ error: 'Виріб не знайдено' }, { status: 404 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileId = await uploadPiecePhoto(studioId, piece.number, buffer, mimeType)
    const url = photoUrl(fileId)
    await setPhoto(studioId, rowIndex, url)

    return NextResponse.json({ url, fileId })
  } catch (error) {
    console.error('[api/pieces/photo]', error)
    return NextResponse.json({ error: 'Не вдалося зберегти фото' }, { status: 500 })
  }
}
