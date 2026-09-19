'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Money } from '@/components/money'
import type { Faixa } from '../_lib/insights'

interface Props {
  faixa: Faixa
  janela: number
  spark: { ym: string; label: string; total: number }[]
  color: string
}

const JANELAS: { key: string; n: number }[] = [
  { key: '2m', n: 2 },
  { key: '3m', n: 3 },
  { key: '6m', n: 6 },
]

export function InsightsHeader({ faixa, janela, spark, color }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const pick = (med: string) => {
    const n = new URLSearchParams(params.toString())
    n.set('med', med)
    router.push(`${pathname}?${n.toString()}`)
  }

  const up = faixa.status === 'acima'
  const down = faixa.status === 'abaixo'
  const badgeColor = up ? 'var(--negative)' : down ? 'var(--positive)' : 'var(--ink-soft)'
  const badgeBg = up ? 'var(--negative-soft)' : down ? 'var(--positive-soft)' : 'var(--surface-2)'
  const abs = Math.abs(faixa.variacaoPct)

  const max = spark.reduce((m, p) => Math.max(m, p.total), 0)
  const W = 150
  const H = 48
  const pts = spark.map((p, i) => {
    const x = spark.length > 1 ? (i / (spark.length - 1)) * W : 0
    const y = max > 0 ? H - (p.total / max) * (H - 6) - 3 : H - 3
    return { x, y }
  })
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]

  return (
    <div className="rounded-[18px] p-4 sm:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="gd-mono text-[26px] font-extrabold tracking-[-0.02em]" style={{ color: 'var(--ink)' }}>
              <Money cents={faixa.totalMes} />
            </span>
            {faixa.status !== 'sem-base' && (
              <span className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ color: badgeColor, background: badgeBg }}>
                {up ? '↑' : down ? '↓' : ''} {faixa.status === 'media' ? 'na média' : abs === 0 ? `${up ? 'acima' : 'abaixo'} da média` : `${abs}% ${up ? 'acima' : 'abaixo'}`}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            {faixa.status === 'sem-base' ? (
              'ainda sem base de comparação'
            ) : (
              <>média de {janela} meses: <b className="gd-mono" style={{ color: 'var(--ink)' }}><Money cents={faixa.media} /></b></>
            )}
          </p>
          <div className="mt-2.5 flex gap-1">
            {JANELAS.map((j) => (
              <button
                key={j.key}
                type="button"
                onClick={() => pick(j.key)}
                className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
                style={j.n === janela ? { background: 'var(--ink)', color: 'var(--bg)' } : { color: 'var(--ink-soft)', border: '1px solid var(--line)' }}
              >{j.key}</button>
            ))}
          </div>
        </div>
        <div className="text-right">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <polyline points={poly} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {last && <circle cx={last.x} cy={last.y} r="3.5" fill={color} />}
          </svg>
          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{spark[0]?.label} → {spark[spark.length - 1]?.label}</p>
        </div>
      </div>
    </div>
  )
}
