import { createHash } from 'crypto'
import { getSheetsClient, readValues } from './google-sheets'
import { hashPassword, verifyPassword } from './password'
import type { Role, Session } from './auth'

// Відбиток — щоб сесія знала, чи не змінився пароль відтоді, як її видали
function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12)
}

// Аркуш «Users» живе в основній таблиці (Суми) — користувачі спільні для обох студій.
const SHEET = 'Users'
const HEADER = ["Ім'я", 'Логін', 'Роль', 'Студія', 'Пароль [хеш]', 'Створено', 'Активний']
const DATA_ROW = 2

export interface User {
  rowIndex: number
  name: string
  login: string
  role: Role
  studio: string | null
  passwordHash: string
  active: boolean
}

function mainSpreadsheetId(): string {
  return process.env.GOOGLE_SPREADSHEET_ID!
}

async function ensureSheet(): Promise<void> {
  const sheets = getSheetsClient()
  const spreadsheetId = mainSpreadsheetId()

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))',
  })
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET)
  if (exists) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET}!A1:G1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER] },
  })
}

function rowToUser(row: string[], rowIndex: number): User | null {
  const login = (row[1] ?? '').trim().toLowerCase()
  if (!login) return null

  const roleRaw = (row[2] ?? '').trim().toLowerCase()
  const studioRaw = (row[3] ?? '').trim().toLowerCase()
  const activeRaw = (row[6] ?? '').trim().toUpperCase()

  return {
    rowIndex,
    name: (row[0] ?? '').trim(),
    login,
    role: roleRaw === 'admin' ? 'admin' : 'master',
    studio: studioRaw === 'sumy' || studioRaw === 'if' ? studioRaw : null,
    passwordHash: (row[4] ?? '').trim(),
    active: activeRaw !== 'FALSE' && activeRaw !== 'НІ',
  }
}

export async function listUsers(): Promise<User[]> {
  await ensureSheet()
  const rows = await readValues(mainSpreadsheetId(), `${SHEET}!A${DATA_ROW}:G`)
  return rows
    .map((row, i) => rowToUser(row, DATA_ROW + i))
    .filter((u): u is User => u !== null)
}

export async function createUser(data: {
  name: string
  login: string
  role: Role
  studio: string | null
  password: string
}): Promise<void> {
  await ensureSheet()
  const sheets = getSheetsClient()
  const passwordHash = await hashPassword(data.password)

  await sheets.spreadsheets.values.append({
    spreadsheetId: mainSpreadsheetId(),
    range: `${SHEET}!A${DATA_ROW}:G`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        data.name,
        data.login.trim().toLowerCase(),
        data.role,
        data.studio ?? '',
        passwordHash,
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        'TRUE',
      ]],
    },
  })
}

export async function setUserPassword(rowIndex: number, password: string): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: mainSpreadsheetId(),
    range: `${SHEET}!E${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[await hashPassword(password)]] },
  })
}

export async function setUserActive(rowIndex: number, active: boolean): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: mainSpreadsheetId(),
    range: `${SHEET}!G${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[active ? 'TRUE' : 'FALSE']] },
  })
}

export interface AuthenticatedUser {
  login: string
  name: string
  role: Role
  studio: string | null
  fp: string
}

// Перший вхід: поки в таблиці нікого немає, працює обліковий запис із змінних оточення.
function bootstrapUser(login: string, password: string): AuthenticatedUser | null {
  const bootLogin = (process.env.ADMIN_LOGIN ?? '').trim().toLowerCase()
  const bootPassword = process.env.ADMIN_PASSWORD ?? ''
  if (!bootLogin || !bootPassword) return null
  if (login !== bootLogin || password !== bootPassword) return null
  return {
    login: bootLogin, name: 'Адміністратор', role: 'admin', studio: null,
    fp: fingerprint(bootPassword),
  }
}

export async function authenticate(
  loginRaw: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const login = loginRaw.trim().toLowerCase()
  const users = await listUsers()

  const user = users.find((u) => u.login === login)
  if (!user) return bootstrapUser(login, password)
  if (!user.active || !user.passwordHash) return null
  if (!(await verifyPassword(password, user.passwordHash))) return null

  return {
    login: user.login, name: user.name, role: user.role, studio: user.studio,
    fp: fingerprint(user.passwordHash),
  }
}

// Чи діє сесія просто зараз: користувача могли вимкнути, видалити
// або перевипустити йому пароль уже після того, як він увійшов.
export async function sessionStillValid(session: Session): Promise<boolean> {
  const bootLogin = (process.env.ADMIN_LOGIN ?? '').trim().toLowerCase()
  const bootPassword = process.env.ADMIN_PASSWORD ?? ''

  let users: User[]
  try {
    users = await listUsers()
  } catch {
    // Таблиця недоступна — не виганяємо всіх, бо це збій на нашому боці
    return true
  }

  const user = users.find((u) => u.login === session.login)
  if (!user) {
    // Обліковий запис із змінних оточення живе, поки в таблиці нікого немає
    if (bootLogin && session.login === bootLogin && bootPassword) {
      return !session.fp || session.fp === fingerprint(bootPassword)
    }
    return false
  }

  if (!user.active || !user.passwordHash) return false
  // Старі сесії без відбитка не рвемо — вони зникнуть самі за строком
  return !session.fp || session.fp === fingerprint(user.passwordHash)
}
