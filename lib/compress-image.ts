// Фото з планшета важить 8–12 МБ, і поки воно доїде до сервера, а звідти
// на Drive, встигає спрацювати обмеження часу на функцію. Тому стискаємо
// в браузері: той самий знімок після цього важить менше мегабайта.
//
// Побічна вигода — canvas перекодовує будь-що в JPEG, тож HEIC з айфона
// теж перестає бути проблемою.

const MAX_SIDE = 2000      // довша сторона; для фото виробу цього з головою
const QUALITY = 0.85
const SKIP_UNDER = 600 * 1024  // дрібне не чіпаємо — тільки якість втратимо

export async function compressImage(file: File): Promise<File> {
  if (file.size <= SKIP_UNDER) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY)
    })
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    // Браузер не впорався з форматом — хай їде як є, сервер вирішить
    return file
  }
}
