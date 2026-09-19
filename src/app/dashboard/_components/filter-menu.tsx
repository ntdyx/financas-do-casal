'use client'

import { useState, useRef, useEffect } from 'react'

export interface FilterOption {
  value: string
  label: string
  dot?: string
  emoji?: string
}

interface Props {
  /** Texto fixo à esquerda (ex: "Quem"). Opcional. */
  label?: string
  /** Ícone/emoji antes do texto. Opcional. */
  icon?: string
  value: string
  options: FilterOption[]
  onSelect: (value: string) => void
  /** Largura do popover. */
  width?: number
  /** Valor "neutro" (sem highlight). Padrão: a primeira opção. */
  defaultValue?: string
}

/**
 * Botão de filtro que abre as opções ao clicar (popover).
 * Mostra a seleção atual no próprio botão e destaca em roxo quando
 * há um filtro ativo (valor diferente do primeiro/"todos").
 */
export function FilterMenu({ label, icon, value, options, onSelect, width = 220, defaultValue }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = options.find((o) => o.value === value) ?? options[0]
  // "ativo" = diferente do valor neutro (1ª opção por padrão, ou defaultValue)
  const neutral = defaultValue ?? options[0]?.value
  const isActive = value !== neutral

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors"
        style={
          isActive
            ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }
            : { background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line-strong)' }
        }
      >
        {icon && <span className="text-[15px] leading-none">{icon}</span>}
        {label && <span style={{ color: isActive ? 'var(--accent)' : 'var(--ink-soft)' }}>{label}:</span>}
        {selected?.dot && <span className="h-2 w-2 rounded-full" style={{ background: selected.dot }} />}
        <span className="max-w-[160px] truncate">{selected?.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border bg-white py-1.5 shadow-lg"
          style={{ borderColor: 'var(--line-strong)', width }}
        >
          {options.map((opt) => {
            const on = opt.value === value
            return (
              <button
                key={opt.value || '__all'}
                type="button"
                onClick={() => { onSelect(opt.value); setOpen(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04]"
                style={{ color: on ? 'var(--accent)' : 'var(--ink-2)', fontWeight: on ? 600 : 500 }}
              >
                {opt.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: opt.dot }} />}
                {opt.emoji && <span className="shrink-0">{opt.emoji}</span>}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {on && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
