export interface StudioInfo {
  id: string
  name: string
  city: string
  cityLocative: string // місцевий відмінок: 'Сумах' / 'Івано-Франківську'
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
    cityLocative: 'Сумах',
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
    cityLocative: 'Івано-Франківську',
    address: 'вулиця Національної гвардії, 14Ю (ЖК "Паркове містечко")',
    instagramHandle: '@osonnya.ceramics.if',
    instagramHighlightsUrl: 'https://www.instagram.com/osonnya.ceramics.if/',
    pricePerPerson: 700,
    basePath: '/if',
    successPath: '/if/success',
  },
}

/**
 * Коли можна забрати й оплатити паперовий сертифікат. Однакові для обох
 * студій, тому не в `StudioInfo`: щоб зміна була в одному місці, а не в двох.
 */
export const CERT_PICKUP_HOURS = 'пт–нд, 12:00–14:00 та 16:00–18:00'

export function getStudio(studioId: string): StudioInfo | null {
  return STUDIOS[studioId] ?? null
}

/** Повертає spreadsheetId для студії. Тільки для серверного коду. */
export function getSpreadsheetId(studioId: string): string {
  if (studioId === 'if') return process.env.GOOGLE_SPREADSHEET_ID_IF!
  return process.env.GOOGLE_SPREADSHEET_ID!
}
