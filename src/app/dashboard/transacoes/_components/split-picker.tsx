'use client'

import { P1, P2 } from '@/lib/casal'
import { useTransition, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateTransactionSplit } from '../actions'

const PRESETS: { label: string; chip: string; minePct: number | null; color: string }[] = [
  { label: 'Sem divisão',           chip: '—',      minePct: null, color: 'var(--ink-soft)' },
  { label: `100% ${P1.name}`,          chip: P1.short,    minePct: 100,  color: 'var(--na)' },
  { label: '50% / 50%',             chip: '50/50',  minePct: 50,   color: 'var(--ink-2)' },
  { label: `75% ${P2.name} / 25% ${P1.short}`, chip: '75/25',  minePct: 25,   color: 'var(--je)' },
  { label: `100% ${P2.name}`,          chip: P2.short,    minePct: 0,    color: 'var(--je)' },
]

interface Props {
  txId: string
  current: number | null
}

export function SplitPicker({ txId, current }: Props) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const active = PRESETS.find((p) => p.minePct === current) ?? PRESETS[0]
  const hasSplit = current !== null

  function toggleOpen() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom
      setOpenUp(below < 240 && rect.top > below)
    }
    setOpen((v) => !v)
  }

  function handleSelect(minePct: number | null) {
    setOpen(false)
    startTransition(async () => {
      await updateTransactionSplit(txId, minePct)
      router.refresh()
    })
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={toggleOpen}
        disabled={isPending}
        title={hasSplit ? `Divisão: ${active.label}` : 'Definir divisão'}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
        style={
          hasSplit
            ? { background: `${active.color}1f`, color: active.color }
            : { background: 'transparent', color: 'var(--ink-soft)', border: '1px dashed var(--line-strong)' }
        }
      >
        <SplitIcon />
        {hasSplit ? active.chip : 'Dividir'}
        <span className="text-[9px] opacity-50">▾</span>
      </button>

      {open && (
        <div className={`absolute right-0 z-50 w-48 overflow-hidden rounded-xl border bg-white py-1 shadow-lg ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`} style={{ borderColor: 'var(--line-strong)' }}>
          {PRESETS.map((p) => (
            <button
              key={String(p.minePct)}
              onClick={() => handleSelect(p.minePct)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium transition-colors hover:bg-black/[0.04]"
              style={{ color: p.minePct === current ? p.color : 'var(--ink-2)' }}
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.label}
              </span>
              {p.minePct === current && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SplitIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}
