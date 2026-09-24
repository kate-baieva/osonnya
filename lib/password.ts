import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(':')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false

  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== KEY_LENGTH) return false

  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH)
  return timingSafeEqual(derived, expected)
}

// Пароль для нової майстрині — читабельний, без неоднозначних символів
export function generatePassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) {
    out += chars[randomBytes(1)[0] % chars.length]
    if (i === 4) out += '-'
  }
  return out
}
