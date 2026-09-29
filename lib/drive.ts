import { Readable } from 'stream'
import { google } from 'googleapis'

// Фото виробів лежать на Google Drive, по папці на студію.
// Усередині кожної — підпапка «Віддали», куди фото переїжджає,
// коли виріб забрали. У Франківську вона вже є, для Сум створюємо за потреби.

const DELIVERED_FOLDER_NAME = 'Віддали'

const PHOTO_FOLDERS: Record<string, string> = {
  sumy: process.env.DRIVE_FOLDER_SUMY ?? '1qwrj4Nl8QHxPcjj1HDyVtkFc4NbVs-hd',
  if: process.env.DRIVE_FOLDER_IF ?? '1j-AaTkCLLQklePYzKEbReZzsJb832vWW',
}

function getDrive() {
  const raw = process.env.GOOGLE_CREDENTIALS ?? ''
  if (!raw) throw new Error('GOOGLE_CREDENTIALS не налаштований')
  return google.drive({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/drive'],
    }),
  })
}

function folderFor(studioId: string): string {
  const folder = PHOTO_FOLDERS[studioId]
  if (!folder) throw new Error(`Для студії «${studioId}» не вказано папку з фото`)
  return folder
}

// Посилання, яке видно і в таблиці, і в застосунку
export function photoUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

export function fileIdFromUrl(value: string): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/\/d\/([A-Za-z0-9_-]{20,})/) ?? text.match(/[?&]id=([A-Za-z0-9_-]{20,})/)
  if (match) return match[1]
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : null
}

const deliveredCache = new Map<string, string>()

async function deliveredFolder(studioId: string): Promise<string> {
  const cached = deliveredCache.get(studioId)
  if (cached) return cached

  const drive = getDrive()
  const parent = folderFor(studioId)

  const existing = await drive.files.list({
    q: `'${parent}' in parents and name='${DELIVERED_FOLDER_NAME}'`
      + " and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
    pageSize: 1,
  })

  let id = existing.data.files?.[0]?.id ?? null
  if (!id) {
    const created = await drive.files.create({
      requestBody: {
        name: DELIVERED_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parent],
      },
      fields: 'id',
    })
    id = created.data.id!
  }

  deliveredCache.set(studioId, id)
  return id
}

// Нове фото називаємо номером виробу — щоб і в папці було видно, що де.
// Якщо фото для цього номера вже є, замінюємо його, а не плодимо копії.
export async function uploadPiecePhoto(
  studioId: string,
  pieceNumber: string,
  body: Buffer,
  mimeType: string,
): Promise<string> {
  // Завантажуємо від імені власниці: у сервісного акаунта немає квоти на Drive
  const { uploadClient } = await import('./drive-oauth')
  const drive = await uploadClient()
  if (!drive) {
    throw new Error('Google Drive не під\'єднано — зробіть це в налаштуваннях профілю')
  }
  const parent = folderFor(studioId)
  const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
  const name = `${pieceNumber}.${extension}`

  const existing = await drive.files.list({
    q: `'${parent}' in parents and name='${name}' and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
  })

  const media = { mimeType, body: Readable.from(body) }
  const found = existing.data.files?.[0]?.id

  if (found) {
    await drive.files.update({ fileId: found, media })
    return found
  }

  const created = await drive.files.create({
    requestBody: { name, parents: [parent] },
    media,
    fields: 'id',
  })
  return created.data.id!
}

// Виріб забрали — фото переїжджає в «Віддали»
export async function moveToDelivered(studioId: string, fileId: string): Promise<void> {
  const drive = getDrive()
  const target = await deliveredFolder(studioId)

  const file = await drive.files.get({ fileId, fields: 'parents' })
  const parents = file.data.parents ?? []
  if (parents.includes(target)) return

  await drive.files.update({
    fileId,
    addParents: target,
    removeParents: parents.join(','),
    fields: 'id',
  })
}

export async function getPhoto(fileId: string): Promise<{ body: Buffer; mimeType: string }> {
  const drive = getDrive()
  const meta = await drive.files.get({ fileId, fields: 'mimeType' })
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  return {
    body: Buffer.from(res.data as ArrayBuffer),
    mimeType: meta.data.mimeType ?? 'image/jpeg',
  }
}
