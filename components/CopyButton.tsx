'use client'

import { useState } from 'react'
import ui from './ui.module.css'

export default function CopyButton({
  text,
  label = 'Копіювати',
  className,
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button type="button" className={className ?? `${ui.btn} ${ui.btnSmall}`} onClick={copy}>
      {copied ? '✓ Скопійовано' : label}
    </button>
  )
}
