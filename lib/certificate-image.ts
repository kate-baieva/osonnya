import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import path from 'path'

const W = 1290
const H = 966

let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const root = process.cwd()
  GlobalFonts.registerFromPath(path.join(root, 'public/fonts/Mak.otf'), 'Mak')
  GlobalFonts.registerFromPath(
    path.join(root, 'public/fonts/Montserrat_Alternates/MontserratAlternates-Light.ttf'),
    'MontAltLight',
  )
  GlobalFonts.registerFromPath(
    path.join(root, 'public/fonts/Montserrat_Alternates/MontserratAlternates-Regular.ttf'),
    'MontAltReg',
  )
  fontsRegistered = true
}

function pluralPeople(n: number): string {
  if (n === 1) return 'людина'
  if (n >= 2 && n <= 4) return 'людини'
  return 'людей'
}

export interface CertImageData {
  certCode: string
  peopleCount: number
  isGroup: boolean
  expiresAt: Date
  instagram: string // '@osonnya.ceramics' або '@osonnya.ceramics.if'
}

// Генерує PNG подарункового сертифіката (1290×966).
export async function renderCertificateImage(data: CertImageData): Promise<Buffer> {
  ensureFonts()
  const root = process.cwd()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Фон
  const bg = await loadImage(path.join(root, 'public/cert-background.png'))
  ctx.drawImage(bg, 0, 0, W, H)

  // Темний градієнт зліва
  const grad = ctx.createLinearGradient(0, 0, W * 0.78, 0)
  grad.addColorStop(0, 'rgba(0,0,0,0.62)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.48)')
  grad.addColorStop(0.75, 'rgba(0,0,0,0.22)')
  grad.addColorStop(1, 'rgba(0,0,0,0.05)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Логотип (білий)
  try {
    const logo = await loadImage(path.join(root, 'public/logo-white.svg'))
    const lh = 52
    const lw = (logo.width * lh) / logo.height
    ctx.drawImage(logo, 52, 44, lw, lh)
  } catch {
    /* без логотипа, якщо не завантажився */
  }

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // «Подарунковий»
  ctx.font = '105px "Mak"'
  ctx.fillText('Подарунковий', 55, 368)

  // «сертифікат №CODE»
  ctx.font = '38px "MontAltLight"'
  ctx.fillText(`сертифікат №${data.certCode}`, 57, 432)

  // Опис МК
  const mkType = data.isGroup ? 'Груповий' : data.peopleCount === 2 ? 'Парний' : 'Індивідуальний'
  ctx.font = '27px "MontAltReg"'
  ctx.fillText(`На ${mkType} майстер-клас з ліплення з глини`, 55, 528)
  ctx.fillText(`${data.peopleCount} ${pluralPeople(data.peopleCount)}`, 55, 570)

  // Термін дії
  const d = data.expiresAt
  const dateStr = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  ctx.fillText(`Дійсний до ${dateStr}`, 55, 670)

  // Instagram
  ctx.font = '24px "MontAltReg"'
  ctx.fillText(data.instagram, 55, 928)

  return canvas.toBuffer('image/png')
}
