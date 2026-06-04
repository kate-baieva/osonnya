export interface StudioInfo {
  id: string
  name: string
  city: string
  address: string
  instagramHandle: string
  instagramHighlightsUrl: string
  pricePerPerson: number
  basePath: string    // '/sumy' або '/if'
  successPath: string // '/sumy/success' або '/if/success'
}

export const STUDIOS: Record<string, StudioInfo> = {
  sumy: {
    id: 'sumy',
    name: 'Осоння Суми',
    city: 'Суми',
    address: 'проспект Свободи, 14',
    instagramHandle: '@osonnya.ceramics',
    instagramHighlightsUrl: 'https://www.instagram.com/stories/highlights/18321951592248393/',
    pricePerPerson: 650,
    basePath: '/sumy',
    successPath: '/sumy/success',
  },
  if: {
    id: 'if',
    name: 'Осоння Івано-Франківськ',
    city: 'Івано-Франківськ',
    address: 'вулиця Національної гвардії, 14Ю (ЖК "Паркове містечко")',
    instagramHandle: '@osonnya.ceramics.if',
    instagramHighlightsUrl: 'https://www.instagram.com/osonnya.ceramics.if/',
    pricePerPerson: 700,
    basePath: '/if',
    successPath: '/if/success',
  },
}

export function getStudio(studioId: string): StudioInfo | null {
  return STUDIOS[studioId] ?? null
}

/** Повертає spreadsheetId для студії. Тільки для серверного коду. */
export function getSpreadsheetId(studioId: string): string {
  if (studioId === 'if') return process.env.GOOGLE_SPREADSHEET_ID_IF!
  return process.env.GOOGLE_SPREADSHEET_ID!
}
