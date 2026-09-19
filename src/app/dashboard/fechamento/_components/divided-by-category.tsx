'use client'

import { useState } from 'react'
import { Money } from '@/components/money'
import { CategoryPicker } from '../../transacoes/_components/category-picker'
import { SplitPicker } from '../../transacoes/_components/split-picker'
import { RowActionsMenu } from '../../transacoes/_components/row-actions-menu'
import type { FixedBillRow } from '../../transacoes/actions'

interface Category {
  id: string
  name: string
  emoji: string
  color: string
  user_id?: string | null
}

export interface DivItem {
  id: string
  name: string
  amount: number // centavos (positivo)
  date: string // ISO yyyy-mm-dd
  category: { id: string; name: string; emoji: string; color: string } | null
  splitMinePct: number | null
  fixedBillId: string | null
  isManual: boolean
  isFixed: boolean
}
export interface DivCat {
  name: string
  emoji: string
  color: string
  total: number // centavos
  items: DivItem[]
}

interface Props {
  cats: DivCat[]
  total: number
  categories: Category[]
  bills: FixedBillRow[]
}

/**
 * Donut de "Gastos divididos por categoria" (fechamento) — clicável.
 * Tocar numa fatia (ou na legenda) abre embaixo os gastos daquela categoria, e
 * cada gasto pode ter a categoria trocada ali mesmo. A troca já vira aprendizado.
 */
export function DividedByCategory({ cats, total, categories, bills }: Props) {
  const [sel, setSel] = useState<string | null>(null)
  const active = cats.find((c) => c.name === sel) ?? null

  if (cats.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--ink-softer)' }}>Sem gastos divididos neste mês.</p>
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <Donut cats={cats} total={total} sel={sel} onSelect={setSel} />
        <ul className="flex w-full flex-col gap-1">
          {cats.map((c) => {
            const pct = total > 0 ? Math.round((c.total / total) * 100) : 0
            const on = c.name === sel
            const dim = sel !== null && !on
            return (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => setSel(on ? null : c.name)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-black/[0.04]"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full transition-opacity" style={{ background: c.color, opacity: dim ? 0.25 : 1 }} />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 transition-opacity" style={{ color: 'var(--ink-2)', fontWeight: on ? 700 : 500, opacity: dim ? 0.35 : 1 }}>
                    <span>{c.emoji}</span> <span className="truncate">{c.name}</span>
                  </span>
                  <span className="gd-mono shrink-0 transition-opacity" style={{ color: 'var(--ink-soft)', opacity: dim ? 0.35 : 1 }}>
                    <Money cents={c.total} /> · {pct}%
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* painel de gastos da fatia — só depois de clicar */}
      {active && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold" style={{ color: 'var(--ink)' }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: active.color }} />
              <span className="truncate">{active.emoji} {active.name}</span>
              <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--ink-soft)' }}>· {active.items.length}</span>
            </span>
            <span className="gd-mono shrink-0 text-sm font-extrabold" style={{ color: 'var(--ink)' }}><Money cents={active.total} /></span>
          </div>
          <div className="flex flex-col gap-1.5">
            {active.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 rounded-[10px] px-3 py-2.5" style={{ background: 'var(--bg)' }}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CategoryPicker txId={it.id} current={it.category} categories={categories} learn />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{it.name}</div>
                    <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>{fmtDay(it.date)}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <SplitPicker txId={it.id} current={it.splitMinePct} />
                  <span className="gd-mono text-[13.5px] font-bold" style={{ color: 'var(--ink)' }}><Money cents={it.amount} /></span>
                  <RowActionsMenu txId={it.id} fixedBillId={it.fixedBillId} bills={bills} isTransfer={false} isManual={it.isManual} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11.5px]" style={{ color: 'var(--ink-softer)' }}>
            Trocar categoria ou divisão aqui já vira aprendizado — vale pros iguais e aparece em Aprendizados.
          </p>
        </div>
      )}
    </div>
  )
}

function Donut({ cats, total, sel, onSelect }: { cats: DivCat[]; total: number; sel: string | null; onSelect: (name: string) => void }) {
  const size = 168
  const stroke = 28
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2

  const segs = cats.map((cat, i) => {
    const before = cats.slice(0, i).reduce((s, x) => s + x.total, 0)
    const frac = total > 0 ? cat.total / total : 0
    const off = (total > 0 ? before / total : 0) * c
    return { name: cat.name, color: cat.color, dash: frac * c, off }
  })

  const active = cats.find((x) => x.name === sel) ?? null
  const activePct = active && total > 0 ? Math.round((active.total / total) * 100) : 0

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gastos divididos por categoria">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {segs.map((s) => (
            <circle
              key={s.name}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.off}
              className="cursor-pointer transition-opacity"
              style={{ opacity: sel && sel !== s.name ? 0.22 : 1 }}
              onClick={() => onSelect(sel === s.name ? '' : s.name)}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {active ? (
          <>
            <span className="gd-mono text-[18px] font-bold leading-none" style={{ color: 'var(--ink)' }}><Money cents={active.total} /></span>
            <span className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{active.emoji} · {activePct}%</span>
          </>
        ) : (
          <>
            <span className="gd-mono text-[18px] font-bold leading-none" style={{ color: 'var(--ink)' }}><Money cents={total} /></span>
            <span className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>dividido</span>
          </>
        )}
      </div>
    </div>
  )
}

function fmtDay(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
