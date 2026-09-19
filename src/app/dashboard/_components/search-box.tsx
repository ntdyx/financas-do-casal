'use client'

import { useState, useRef, useEffect } from 'react'

/**
 * Campo de busca que começa só como uma lupa e expande ao clicar.
 * Fica roxo quando há uma busca ativa. Compartilhado por Gastos,
 * Entradas e Investimentos.
 */
export function SearchBox({
  current,
  onSearch,
  placeholder = 'Buscar…',
}: {
  current: string
  onSearch: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(!!current)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const active = !!current

  if (!open) {
    // Só a lupa. Roxa quando há busca ativa.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        title={active ? `Buscando: ${current}` : 'Buscar'}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border transition-colors"
        style={active
          ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }
          : { background: 'var(--surface)', color: 'var(--ink-soft)', borderColor: 'var(--line-strong)' }}
      >
        <SearchIcon />
      </button>
    )
  }

  return (
    <div className="flex h-[38px] items-center gap-1.5 rounded-xl border pl-3 pr-1.5" style={{ background: 'var(--surface)', borderColor: 'var(--accent)' }}>
      <button type="button" aria-label="Buscar" onClick={() => onSearch(inputRef.current?.value ?? '')} style={{ color: 'var(--accent)' }}>
        <SearchIcon />
      </button>
      <input
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        defaultValue={current}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch((e.target as HTMLInputElement).value); if (e.key === 'Escape') { if (!current) setOpen(false) } }}
        onBlur={(e) => { onSearch(e.target.value); if (!e.target.value) setOpen(false) }}
        className="w-40 bg-transparent text-sm outline-none"
        style={{ color: 'var(--ink)' }}
      />
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
