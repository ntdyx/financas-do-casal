'use client'

import { useState } from 'react'
import { Money } from '@/components/money'
import { CategoryPicker } from '../../transacoes/_components/category-picker'
import type { CatBadge, MerchantStat } from '../_lib/insights'

interface Category {
  id: string
  name: string
  emoji: string
  color: string
  user_id?: string | null
}

export interface RepItem {
  id?: string
  name: string
  date: string // já formatado, ex. "16 jun"
  account: string
  amount: number // centavos (positivo)
  installment: string | null // ex. "3/10" ou null
  category?: { id: string; name: string; emoji: string; color: string } | null
}
export interface RepCat {
  name: string
  emoji: string
  color: string
  total: number // centavos
  items: RepItem[]
  badge?: CatBadge | null
  merchants?: MerchantStat[] | null
}

interface Props {
  cats: RepCat[]
  total: number
  color: string
  /** Quando passado, cada gasto pode ter a categoria trocada (já aprende). */
  categories?: Category[]
  /** Nome da categoria a abrir já expandida (ex. vindo de um link da home). */
  initialCat?: string
}

function CatBadgePill({ badge }: { badge: CatBadge }) {
  const map = {
    acima: { txt: `↑ ${Math.abs(badge.pct)}%`, color: 'var(--negative)', bg: 'var(--negative-soft)' },
    abaixo: { txt: `↓ ${Math.abs(badge.pct)}%`, color: 'var(--positive)', bg: 'var(--positive-soft)' },
    media: { txt: 'na média', color: 'var(--ink-soft)', bg: 'var(--surface-2)' },
    novo: { txt: 'novo', color: 'var(--negative)', bg: 'var(--negative-soft)' },
  } as const
  const s = map[badge.kind]
  return (
    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none" style={{ color: s.color, background: s.bg }}>{s.txt}</span>
  )
}

/**
 * "Maiores gastos" — barras horizontais por categoria. Clicar numa categoria
 * abre embaixo o painel com os gastos daquela categoria (data, conta, parcela).
 */
export function ReportChart({ cats, total, color, categories, initialCat }: Props) {
  const [sel, setSel] = useState<string | null>(initialCat ?? null)

  const max = cats.length > 0 ? cats[0].total : 0
  const active = cats.find((c) => c.name === sel) ?? null

  return (
    <div className="overflow-hidden rounded-[18px]" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      {/* barras */}
      <div className="px-5 pb-4 pt-5 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15.5px] font-bold" style={{ color: 'var(--ink)' }}>Maiores gastos</span>
          <span className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            total: <b className="gd-mono" style={{ color: 'var(--ink)' }}><Money cents={total} /></b>
          </span>
        </div>

        <div className="flex flex-col">
          {cats.map((c) => {
            const on = c.name === sel
            const barPct = max > 0 ? Math.max(3, Math.round((c.total / max) * 100)) : 0
            const share = total > 0 ? Math.round((c.total / total) * 100) : 0
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setSel(on ? null : c.name)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors sm:gap-4"
                style={{ background: on ? 'var(--bg)' : 'transparent' }}
              >
                <span className="shrink-0 text-[17px]">{c.emoji}</span>
                <div className="w-[92px] shrink-0 sm:w-[132px]">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px]" style={{ color: 'var(--ink)', fontWeight: on ? 700 : 600 }}>{c.name}</span>
                    {c.badge && <CatBadgePill badge={c.badge} />}
                  </div>
                  <div className="gd-mono mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{share}% · <Money cents={c.total} /></div>
                </div>
                <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--bg)' }}>
                  <div className="h-full rounded-full transition-[width]" style={{ width: `${barPct}%`, background: on ? 'var(--ink)' : c.color }} />
                </div>
                <span className="w-3 shrink-0 text-center text-[13px]" style={{ color: on ? 'var(--ink)' : 'var(--ink-softer)' }}>{on ? '▴' : '▾'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* painel de detalhe */}
      {active && (
        <div style={{ borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="text-[19px]">{active.emoji}</span>
              <span className="truncate text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{active.name}</span>
              <span className="gd-mono shrink-0 text-[13px] font-bold" style={{ color }}><Money cents={active.total} /></span>
              <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold" style={{ background: color, color: 'var(--bg)' }}>
                {active.items.length} {active.items.length === 1 ? 'gasto' : 'gastos'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSel(null)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-black/[0.04]"
              style={{ border: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}
            >✕ fechar</button>
          </div>
          {active.merchants && active.merchants.length > 0 && (
            <div className="mb-1 flex flex-col gap-1.5 px-5 sm:px-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--ink-soft)' }}>onde mais repetiu</div>
              {active.merchants.map((m) => (
                <div key={m.name} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold" style={{ color: 'var(--ink)' }}>{m.name}</span>
                    <span className="shrink-0" style={{ color: 'var(--ink-soft)' }}>· {m.count}×</span>
                    {m.prevCount > 0 && m.delta !== 0 && (
                      <span className="shrink-0 font-semibold" style={{ color: m.delta > 0 ? 'var(--negative)' : 'var(--positive)' }}>
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 gd-mono" style={{ color: 'var(--ink-soft)' }}>
                    <Money cents={m.avg} /> méd · <b style={{ color: 'var(--ink)' }}><Money cents={m.total} /></b>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 px-5 pb-5 pt-3 sm:px-6">
            {active.items.map((it, i) => (
              <div key={it.id ?? i} className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>{it.name}</div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>{it.date} · {it.account}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {it.installment && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}>{it.installment}</span>
                  )}
                  {categories && it.id && (
                    <CategoryPicker txId={it.id} current={it.category ?? null} categories={categories} learn />
                  )}
                  <span className="gd-mono text-[14px] font-bold" style={{ color: 'var(--ink)' }}><Money cents={it.amount} /></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
