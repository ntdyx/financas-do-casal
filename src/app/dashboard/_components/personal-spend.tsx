'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Money } from '@/components/money'
import { PersonFace } from '@/components/person-face'
import { CategoryPicker } from '../transacoes/_components/category-picker'
import { SplitPicker } from '../transacoes/_components/split-picker'

interface Category {
  id: string
  name: string
  emoji: string
  color: string
  user_id?: string | null
}

export interface SpendItem {
  id?: string
  name: string
  amount: number // centavos (positivo)
  date: string // ISO yyyy-mm-dd
  category?: { id: string; name: string; emoji: string; color: string } | null
  split?: number | null // split_mine_pct (pra editar a divisão)
}
export interface SpendCat {
  name: string
  emoji: string
  color: string
  total: number // centavos
  items: SpendItem[]
}

interface Props {
  variant: 'nat' | 'jen'
  name: string
  color: string // cor da pessoa (avatar)
  total: number
  cats: SpendCat[]
  href: string
  /** Quando passado, cada gasto do painel pode ter a categoria trocada (já aprende). */
  categories?: Category[]
}

/**
 * Gasto pessoal de uma pessoa (100%, fora da divisão): donut por categoria.
 * Clicar numa fatia (ou na legenda) abre embaixo os gastos daquela categoria.
 */
export function PersonalSpend({ variant, name, color, total, cats, href, categories }: Props) {
  const [sel, setSel] = useState<string | null>(null)

  const isJen = variant === 'jen'
  const cardBg = isJen ? 'var(--je-soft)' : 'var(--na-soft)'
  const cardBorder = isJen ? 'var(--je-line)' : 'var(--na-line)'
  const expenseBg = isJen ? 'rgba(143,212,107,.10)' : 'rgba(124,92,252,.08)'
  const amountColor = isJen ? 'var(--je)' : 'var(--na)'
  const linkColor = isJen ? 'var(--je)' : 'var(--na)'

  const card = { background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 20 }

  const active = cats.find((c) => c.name === sel) ?? null

  if (cats.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-5 sm:p-6" style={card}>
        <Header who={variant} name={name} color={color} total={0} amountColor={amountColor} />
        <p className="py-6 text-center text-[13px]" style={{ color: 'var(--ink-softer)' }}>sem gasto pessoal neste mês</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col p-5 sm:p-6" style={card}>
      <Header who={variant} name={name} color={color} total={total} amountColor={amountColor} />

      <Donut cats={cats} total={total} sel={sel} onSelect={setSel} />

      {/* legenda — 2 colunas */}
      <ul className="grid grid-cols-2 gap-x-2">
        {cats.map((c) => {
          const pct = total > 0 ? Math.round((c.total / total) * 100) : 0
          const on = c.name === sel
          const dim = sel !== null && !on
          return (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => setSel(on ? null : c.name)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full transition-opacity" style={{ background: c.color, opacity: dim ? 0.2 : 1 }} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] transition-opacity" style={{ color: 'var(--ink)', fontWeight: on ? 700 : 500, opacity: dim ? 0.3 : 1 }}>
                  {c.emoji} {c.name}
                </span>
                <span className="gd-mono shrink-0 text-[12px] transition-opacity" style={{ color: 'var(--ink-soft)', opacity: dim ? 0.3 : 1 }}>{pct}%</span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* painel de gastos da fatia — só depois de clicar */}
      {active && (
        <div className="mt-3.5 pt-3.5" style={{ borderTop: `1px solid ${cardBorder}` }}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: active.color }} />
              <span className="truncate">{active.emoji} {active.name}</span>
            </span>
            <span className="gd-mono shrink-0 text-[14px] font-extrabold" style={{ color: amountColor }}><Money cents={active.total} /></span>
          </div>
          <div className="flex flex-col gap-1.5">
            {active.items.slice(0, 6).map((it, i) => (
              <div key={it.id ?? i} className="rounded-[10px] px-3 py-2.5" style={{ background: expenseBg }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{it.name}</div>
                    <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>{fmtDay(it.date)}</div>
                  </div>
                  <span className="gd-mono shrink-0 text-[13.5px] font-bold" style={{ color: 'var(--ink)' }}><Money cents={it.amount} /></span>
                </div>
                {categories && it.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CategoryPicker txId={it.id} current={it.category ?? null} categories={categories} learn />
                    <SplitPicker txId={it.id} current={it.split ?? null} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {active.items.length > 6 && (
            <div className="mt-2 text-[11.5px]" style={{ color: 'var(--ink-softer)' }}>+{active.items.length - 6} gasto(s) nesta categoria</div>
          )}
          {categories && (
            <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-softer)' }}>
              Trocar categoria ou divisão aqui já vira aprendizado. Mudar a divisão tira o gasto desta lista.
            </p>
          )}
        </div>
      )}

      {/* link pro relatório */}
      <div className="mt-4 pt-3.5" style={{ borderTop: `1px solid ${cardBorder}` }}>
        <Link href={href} className="text-[13.5px] font-bold" style={{ color: linkColor }}>ver relatório de {name} →</Link>
      </div>
    </div>
  )
}

function Header({ who, name, color, total, amountColor }: { who: 'nat' | 'jen'; name: string; color: string; total: number; amountColor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold" style={{ background: color, color: '#fff' }}><PersonFace who={who} /></span>
        <span className="text-[16px] font-bold" style={{ color: 'var(--ink)' }}>{name}</span>
      </div>
      <span className="gd-mono text-[19px] font-extrabold tracking-[-0.02em]" style={{ color: amountColor }}><Money cents={total} /></span>
    </div>
  )
}

function Donut({ cats, total, sel, onSelect }: { cats: SpendCat[]; total: number; sel: string | null; onSelect: (name: string) => void }) {
  const size = 150
  const r = 52
  const circ = 2 * Math.PI * r
  const cx = 80
  const cy = 80

  const segs = cats.reduce<{ name: string; color: string; len: number; off: number }[]>((acc, c) => {
    const frac = total > 0 ? c.total / total : 0
    const len = frac * circ
    const off = acc.length ? acc[acc.length - 1].off - acc[acc.length - 1].len : 0
    acc.push({ name: c.name, color: c.color, len, off })
    return acc
  }, [])

  const activeCat = cats.find((c) => c.name === sel) ?? cats[0]
  const activePct = total > 0 ? Math.round((activeCat.total / total) * 100) : 0

  return (
    <div className="mx-auto my-4" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label="Gastos pessoais por categoria" style={{ display: 'block' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={18} />
        {segs.map((s) => (
          <circle
            key={s.name}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={20}
            strokeDasharray={`${s.len} ${circ - s.len}`}
            strokeDashoffset={s.off}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="cursor-pointer transition-opacity"
            style={{ opacity: sel && sel !== s.name ? 0.22 : 1 }}
            onClick={() => onSelect(s.name)}
          />
        ))}
        <text x={cx} y={74} textAnchor="middle" fontSize={20} fontWeight={800} fill="var(--ink)">{activePct}%</text>
        <text x={cx} y={90} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink-soft)">da fatia</text>
      </svg>
    </div>
  )
}

function fmtDay(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
