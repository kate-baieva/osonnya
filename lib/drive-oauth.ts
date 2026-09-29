import { google } from 'googleapis'
import { decrypt, encrypt, getSetting, setSetting } from './app-settings'

// Сервісний акаунт не має власної квоти на Drive і не може створювати файли,
// тож нові фото завантажуються від імені власниці студії — через OAuth.
// Читання й перенесення наявних файлів лишається за сервісним акаунтом.

const TOKEN_SETTING = 'drive_refresh_token'

// drive.file дає доступ лише до файлів, які створив сам застосунок.
// Цього досить для завантаження і не вимагає перевірки застосунку в Google.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function oauthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET не налаштовані')
  }

  return new google.auth.OAuth2(clientId, clientSecret, `${baseUrl}/api/drive/callback`)
}

export function consentUrl(): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // щоб Google точно віддав refresh_token
    scope: [DRIVE_SCOPE],
  })
}

export async function saveRefreshToken(token: string): Promise<void> {
  await setSetting(TOKEN_SETTING, encrypt(token))
}

export async function isConnected(): Promise<boolean> {
  const stored = await getSetting(TOKEN_SETTING)
  return Boolean(stored && decrypt(stored))
}

export async function disconnect(): Promise<void> {
  await setSetting(TOKEN_SETTING, '')
}

// Клієнт для завантаження. null — якщо власниця ще не під'єднала Drive.
export async function uploadClient() {
  const stored = await getSetting(TOKEN_SETTING)
  const refreshToken = stored ? decrypt(stored) : null
  if (!refreshToken) return null

  const client = oauthClient()
  client.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: 'v3', auth: client })
}
