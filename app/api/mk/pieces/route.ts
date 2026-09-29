import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { addPiece, setPhoto } from '@/lib/pieces'
import { photoUrl, uploadPiecePhoto } from '@/lib/drive'
import { STUDIOS } from '@/lib/studios'

const MAX_BYTES = 12 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

// Виріб, зроблений на майстер-класі: створюємо рядок і одразу чіпляємо фото
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

  const studioId = session.role === 'admin' ? String(form.get('studio') ?? '') : session.studio!
  if (!STUDIOS[studioId]) {
    return NextResponse.json({ error: 'Невідома студія' }, { status: 400 })
  }

  const client = String(form.get('client') ?? '').trim()
  const mkDatetime = String(form.get('mkDatetime') ?? '').trim()
  if (!client) return NextResponse.json({ error: "Не вказано, чий це виріб" }, { status: 400 })
  if (!mkDatetime) return NextResponse.json({ error: 'Не вказано майстер-клас' }, { status: 400 })

  const photo = form.get('photo')
  if (photo instanceof File) {
    if (photo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Фото завелике — до 12 МБ' }, { status: 400 })
    }
    if (!ALLOWED.includes(photo.type || 'image/jpeg')) {
      return NextResponse.json({ error: 'Підтримуються лише зображення' }, { status: 400 })
    }
  }

  try {
    const created = await addPiece(studioId, {
      client,
      mkDate: mkDatetime,
      status: 'Невипалений',
      master: session.name,
    })

    // Фото не критичне: виріб уже створений, тож про помилку кажемо окремо
    let photoSaved = true
    if (photo instanceof File) {
      try {
        const buffer = Buffer.from(await photo.arrayBuffer())
        const fileId = await uploadPiecePhoto(
          studioId, created.number, buffer, photo.type || 'image/jpeg',
        )
        await setPhoto(studioId, created.rowIndex, photoUrl(fileId))
      } catch (error) {
        console.error('[api/mk/pieces] фото', error)
        photoSaved = false
      }
    }

    return NextResponse.json({ ...created, photoSaved })
  } catch (error) {
    console.error('[api/mk/pieces]', error)
    return NextResponse.json({ error: 'Не вдалося створити виріб' }, { status: 500 })
  }
}
