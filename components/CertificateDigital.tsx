'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './CertificateDigital.module.css'

// ─── Розміри ─────────────────────────────────────────────
const W = 1290
const H = 966

// ─── Helpers ─────────────────────────────────────────────

function pluralPeople(n: number): string {
  if (n === 1) return 'людина'
  if (n >= 2 && n <= 4) return 'людини'
  return 'людей'
}

function getMkType(mkLabel: string): string {
  const l = mkLabel.toLowerCase()
  if (l.includes('груповий'))      return 'Груповий'
  if (l.includes('парний'))        return 'Парний'
  if (l.includes('індивідуальний')) return 'Індивідуальний'
  return mkLabel
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

// Розбиває рядок на рядки, що вміщуються в maxWidth
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

// ─── Компонент ───────────────────────────────────────────

interface Props {
  certCode: string
  mkLabel: string
  peopleCount: number
  expiresAt: Date
  instagram: string  // '@osonnya.ceramics' або '@osonnya.ceramics.if'
}

export default function CertificateDigital({ certCode, mkLabel, peopleCount, expiresAt, instagram }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    render().then(() => { if (!cancelled) { setReady(true); setLoading(false) } })
             .catch((e) => { console.error(e); if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certCode, mkLabel, peopleCount, expiresAt, instagram])

  async function render() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // ── Завантажуємо шрифти ──────────────────────────────
    // Mak з локального файлу
    try {
      const makFace = new FontFace('Mak', 'url(/fonts/Mak.otf) format("opentype")')
      document.fonts.add(await makFace.load())
    } catch { /* fallback до serif */ }

    // Montserrat Alternates з Google Fonts
    if (!document.getElementById('cert-gfont')) {
      const link = document.createElement('link')
      link.id = 'cert-gfont'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Montserrat+Alternates:wght@300;400&display=swap'
      document.head.appendChild(link)
    }
    await document.fonts.ready
    try { await document.fonts.load('300 30px "Montserrat Alternates"') } catch {}
    try { await document.fonts.load('400 30px "Montserrat Alternates"') } catch {}

    // ── Фон ─────────────────────────────────────────────
    const bg = await loadImg('/cert-background.png')
    ctx.drawImage(bg, 0, 0, W, H)

    // ── Темний градієнт зліва ────────────────────────────
    const grad = ctx.createLinearGradient(0, 0, W * 0.78, 0)
    grad.addColorStop(0,    'rgba(0,0,0,0.62)')
    grad.addColorStop(0.45, 'rgba(0,0,0,0.48)')
    grad.addColorStop(0.75, 'rgba(0,0,0,0.22)')
    grad.addColorStop(1,    'rgba(0,0,0,0.05)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // ── Логотип (білий) ──────────────────────────────────
    try {
      const logo = await loadImg('/logo-white.svg')
      const lh = 52
      const lw = logo.naturalWidth * lh / logo.naturalHeight
      ctx.drawImage(logo, 52, 44, lw, lh)
    } catch {}

    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    // ── "Подарунковий" ───────────────────────────────────
    const makAvailable = document.fonts.check('72px "Mak"')
    ctx.font = `105px ${makAvailable ? '"Mak"' : 'Georgia, serif'}`
    ctx.fillText('Подарунковий', 55, 368)

    // ── "сертифікат №CODE" ───────────────────────────────
    ctx.font = '300 38px "Montserrat Alternates", sans-serif'
    ctx.fillText(`сертифікат №${certCode}`, 57, 432)

    // ── Опис МК ──────────────────────────────────────────
    ctx.font = '400 27px "Montserrat Alternates", sans-serif'
    const mkType = getMkType(mkLabel)
    const descLine = `На ${mkType} майстер-клас з ліплення з глини`
    const descLines = wrapText(ctx, descLine, 750)
    let descY = 528
    for (const line of descLines) {
      ctx.fillText(line, 55, descY)
      descY += 42
    }
    ctx.fillText(`${peopleCount} ${pluralPeople(peopleCount)}`, 55, descY + 2)

    // ── "Дійсний до …" ───────────────────────────────────
    const d = expiresAt
    const dateStr = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
    ctx.fillText(`Дійсний до ${dateStr}`, 55, descY + 100)

    // ── Instagram ────────────────────────────────────────
    ctx.font = '400 24px "Montserrat Alternates", sans-serif'
    ctx.fillText(instagram, 55, 928)
  }

  const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'))

  const download = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fileName = `сертифікат-${certCode}.png`
    const blob = await canvasToBlob(canvas)
    if (!blob) return

    // На телефоні — рідне меню «Поділитися/Зберегти у Фото»
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean
      share?: (d: { files: File[]; title?: string }) => Promise<void>
    }
    const file = new File([blob], fileName, { type: 'image/png' })
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Подарунковий сертифікат' })
        return
      } catch (e) {
        // Користувач закрив меню — нічого не робимо
        if ((e as Error).name === 'AbortError') return
        // Інша помилка — переходимо до звичайного завантаження нижче
      }
    }

    // Десктоп / браузери без Web Share — звичайне завантаження
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = fileName
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.wrapper}>
      {loading && <div className={styles.loader}>Генеруємо сертифікат…</div>}
      <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
      {ready && (
        <button onClick={download} className={styles.downloadBtn}>
          ⬇ Зберегти сертифікат
        </button>
      )}
    </div>
  )
}
