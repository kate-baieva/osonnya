// Типи й константи виробів — без серверних залежностей,
// щоб їх можна було імпортувати в клієнтські компоненти.

export const PIECE_STATUSES = [
  'Невипалений',
  'Утіль',
  'Глазурується',
  'Готово',
  'Забрали',
  'Брак',
  'Частковий брак',
] as const

export type PieceStatus = (typeof PIECE_STATUSES)[number]

// Статуси, які потребують пояснення — при них показуємо поле коментаря
export const DEFECT_STATUSES: string[] = ['Брак', 'Частковий брак']

export const NOTIFIED = 'Повідомили'

export interface Piece {
  rowIndex: number
  number: string
  client: string
  mkDate: string
  status: string
  communication: string
  comment: string
  master: string
  photoUrl: string
}
