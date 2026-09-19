'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Money } from '@/components/money'

export interface ChartCat {
  name: string
  emoji: string
  color: string
  total: number // centavos
}
export interface ChartBucket {
  ym: string // 'YYYY-MM'
  label: string // ex.: "jul 26"
  total: number // centavos
  parts: number[] // alinhado com `legend`, em centavos
}

interface Props {
  legend: ChartCat[]
  buckets: ChartBucket[]
  period: '3m' | '6m' | 'custom'
  start: string // 'YYYY-MM-DD' (resolvido)
  end: string
  grandTotal: number
}

const CHART_H = 220 // px

/**
 * Panorama de gastos abaixo do calendário de Fechamento.
 * Barras empilhadas por categoria (uma barra por mês) com seletor de período:
 * últimos 3 meses, 6 meses ou um intervalo de datas. Conta TODOS os gastos do
 * casal (inclui os 100%), fora transferências e pagamento de fatura.
 */
export function SpendingChart({ legend, buckets, period, start, end, grandTotal }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [custom, setCustom] = useState(period === 'custom')
  const [ci, setCi] = useState(start)
  const [cf, setCf] = useState(end)
  const [sel, setSel] = useState<string | null>(null) // categoria destacada

  const go = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`)

  const pickPreset = (p: '3m' | '6m') => {
    setCustom(false)
    setSel(null)
    const n = new URLSearchParams(params.toString())
    n.set('cp', p)
    n.delete('ci')
    n.delete('cf')
    go(n)
  }

  const applyCustom = () => {
    if (!ci || !cf) return
    const n = new URLSearchParams(params.toString())
    n.set('cp', 'custom')
    n.set('ci', ci <= cf ? ci : cf)
    n.set('cf', ci <= cf ? cf : ci)
    go(n)
  }

  const max = buckets.reduce((m, b) => Math.max(m, b.total), 0)
  const hasData = grandTotal > 0
  const selIdx = sel ? legend.findIndex((l) => l.name === sel) : -1
  const selCat = selIdx >= 0 ? legend[selIdx] : null
  // no modo categoria, reescala pelas barras daquela categoria (compara mês a mês)
  const selMax = selCat ? buckets.reduce((m, b) => Math.max(m, b.parts[selIdx] ?? 0), 0) : 0

  return (
    <div className="gd-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Gastos por período</p>
          <p className="mt-0.5 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {selCat ? (
              <>
                <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{selCat.emoji} {selCat.name}</span>{' '}·{' '}
                <span className="gd-mono"><Money cents={selCat.total} /></span>
                {grandTotal > 0 && <> · {Math.round((selCat.total / grandTotal) * 100)}%</>}
              </>
            ) : (
              <>total no período · <span className="gd-mono" style={{ color: 'var(--ink-2)', fontWeight: 600 }}><Money cents={grandTotal} /></span></>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={period === '3m'} onClick={() => pickPreset('3m')}>3 meses</Pill>
          <Pill active={period === '6m'} onClick={() => pickPreset('6m')}>6 meses</Pill>
          <Pill active={period === 'custom'} onClick={() => setCustom((v) => !v)}>
            Período <span className="text-[10px] opacity-70">{custom ? '▴' : '▾'}</span>
          </Pill>
        </div>
      </div>

      {custom && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl p-3" style={{ background: 'var(--bg)' }}>
          <label className="flex flex-col gap-1 text-[11px] font-medium" style={{ color: 'var(--ink-soft)' }}>
            de
            <input type="date" value={ci} onChange={(e) => setCi(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium" style={{ color: 'var(--ink-soft)' }}>
            até
            <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }} />
          </label>
          <button type="button" onClick={applyCustom} className="h-9 rounded-full px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: 'var(--accent)' }}>
            aplicar
          </button>
        </div>
      )}

      {!hasData ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--ink-softer)' }}>Sem gastos neste período.</p>
      ) : (
        <>
          {/* barras — empilhadas por categoria; ao selecionar, viram série única (compara mês a mês) */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            <div className="flex items-end gap-2.5" style={{ height: CHART_H, minWidth: buckets.length * 44 }}>
              {buckets.map((b) => {
                const val = selCat ? b.parts[selIdx] ?? 0 : b.total
                const scaleMax = selCat ? selMax : max
                return (
                  <div key={b.ym} className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1.5" style={{ height: '100%' }}>
                    <span className="gd-mono text-[10px] font-semibold" style={{ color: 'var(--ink-soft)' }}>
                      {val > 0 ? compact(val) : ''}
                    </span>
                    <div className="flex w-full flex-col-reverse overflow-hidden rounded-md" style={{ height: `${scaleMax > 0 ? (val / scaleMax) * 100 : 0}%`, minHeight: val > 0 ? 3 : 0 }}>
                      {selCat ? (
                        <div className="w-full" title={`${selCat.emoji} ${selCat.name}: ${fmt(val)}`} style={{ height: '100%', background: selCat.color }} />
                      ) : (
                        b.parts.map((p, i) =>
                          p > 0 ? (
                            <div
                              key={i}
                              title={`${legend[i].emoji} ${legend[i].name}: ${fmt(p)}`}
                              className="w-full"
                              style={{ height: `${(p / b.total) * 100}%`, background: legend[i].color }}
                            />
                          ) : null,
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* eixo x */}
          <div className="mt-2 flex gap-2.5" style={{ minWidth: buckets.length * 44 }}>
            {buckets.map((b) => (
              <span key={b.ym} className="min-w-[28px] flex-1 text-center text-[11px] capitalize" style={{ color: 'var(--ink-soft)' }}>{b.label}</span>
            ))}
          </div>

          {/* legenda — clicar destaca a categoria em todas as barras */}
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            {legend.map((c) => {
              const on = c.name === sel
              const dim = sel !== null && !on
              const pct = grandTotal > 0 ? Math.round((c.total / grandTotal) * 100) : 0
              return (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => setSel(on ? null : c.name)}
                    className="flex items-center gap-2 rounded-lg py-1.5 text-left text-[13px] transition-opacity"
                    style={{ opacity: dim ? 0.4 : 1 }}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: c.color }} />
                    <span style={{ color: 'var(--ink-2)', fontWeight: on ? 700 : 500 }}>{c.name}</span>
                    <span className="gd-mono" style={{ color: 'var(--ink-soft)' }}><Money cents={c.total} /> · {pct}%</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors"
      style={
        active
          ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
          : { background: 'transparent', borderColor: 'var(--line-strong)', color: 'var(--ink-2)' }
      }
    >
      {children}
    </button>
  )
}

function fmt(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

/** Rótulo curto pro topo da barra, pra não colidir com o vizinho: "R$ 3,5k". */
function compact(cents: number) {
  const v = cents / 100
  if (v < 1000) return `R$ ${Math.round(v)}`
  const k = v / 1000
  const s = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace('.0', '').replace('.', ',')
  return `R$ ${s}k`
}
