'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'gd-privacy'

export function PrivacyToggle() {
  const [hidden, setHidden] = useState(false)

  // Sincroniza com o atributo já aplicado pelo script anti-flash do layout.
  useEffect(() => {
    setHidden(document.documentElement.dataset.privacy === 'on')
  }, [])

  function toggle() {
    const next = !hidden
    setHidden(next)
    document.documentElement.dataset.privacy = next ? 'on' : 'off'
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? 'Mostrar valores' : 'Esconder valores'}
      title={hidden ? 'Mostrar valores' : 'Esconder valores'}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-2)]"
      style={{ color: 'var(--ink-soft)' }}
    >
      {hidden ? <EyeOff /> : <Eye />}
    </button>
  )
}

const common = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Eye() {
  return (
    <svg {...common}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff() {
  return (
    <svg {...common}>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a16.4 16.4 0 0 1-2.16 3.19M6.6 6.6A16.4 16.4 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4.07-.92M14.1 14.1a3 3 0 1 1-4.2-4.2" />
      <path d="m2 2 20 20" />
    </svg>
  )
}
