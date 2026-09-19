'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function addMonths(value: string, delta: number): string {
  const [y, m] = value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Seletor de mês (YYYY-MM) em pílulas roláveis, agrupadas por ano. Navega via ?mes=. */
export function MonthNav({ current }: { current: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const go = useCallback(
    (mes: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('mes', mes)
      next.delete('p')
      router.push(`${pathname}?${next.toString()}`)
    },
    [router, pathname, params],
  )

  const now = new Date()
  const nowValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 12 meses do ano em exibição (o ano do mês selecionado)
  const year = Number(current.split('-')[0])
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: `${year}-${String(i + 1).padStart(2, '0')}`,
    m: i + 1,
  }))

  const atNow = current >= nowValue

  const step = { width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line-strong)', color: 'var(--ink-2)' }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => go(addMonths(current, -1))}
        aria-label="Mês anterior"
        className="grid shrink-0 place-items-center transition-colors hover:bg-black/[0.04]"
        style={step}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {months.map((mm) => {
          const active = mm.value === current
          const isToday = mm.value === nowValue
          return (
            <button
              key={mm.value}
              onClick={() => go(mm.value)}
              aria-current={active ? 'true' : undefined}
              className="relative h-9 min-w-0 flex-1 rounded-full text-[13px] font-semibold capitalize transition-colors"
              style={
                active
                  ? { background: 'var(--accent)', color: '#fff' }
                  : isToday
                    ? { background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)' }
                    : { background: 'transparent', border: '1px solid var(--line-strong)', color: 'var(--ink-2)' }
              }
            >
              {MESES_CURTO[mm.m - 1]}
              {isToday && !active && (
                <span className="absolute -top-0.5 right-1 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => go(addMonths(current, 1))}
        aria-label="Próximo mês"
        disabled={atNow}
        className="grid shrink-0 place-items-center transition-colors enabled:hover:bg-black/[0.04] disabled:opacity-35"
        style={step}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  )
}
