import { Money } from '@/components/money'
import type { Recurring } from '../_lib/insights'

const MAX_LINHAS = 6

export function RecurringBlock({ rec }: { rec: Recurring }) {
  if (rec.items.length === 0) return null
  const shown = rec.items.slice(0, MAX_LINHAS)
  const rest = rec.items.slice(MAX_LINHAS)
  const restTotal = rest.reduce((s, i) => s + i.amount, 0)

  return (
    <div className="rounded-[18px] p-4 sm:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Fixos todo mês</span>
        <span className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
          <b className="gd-mono" style={{ color: 'var(--ink)' }}><Money cents={rec.total} /></b>/mês · <Money cents={rec.anual} />/ano
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((i) => {
          const subiu = i.prevAmount !== null && i.amount > i.prevAmount
          return (
            <div key={i.key} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                {i.name} <span style={{ color: 'var(--ink-soft)' }}>· {i.category}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {subiu && (
                  <span className="gd-mono text-[11px] font-semibold" style={{ color: 'var(--negative)' }}>
                    <Money cents={i.prevAmount!} /> → <Money cents={i.amount} />
                  </span>
                )}
                {!subiu && <span className="gd-mono" style={{ color: 'var(--ink-soft)' }}><Money cents={i.amount} /></span>}
              </span>
            </div>
          )
        })}
        {rest.length > 0 && (
          <div className="flex items-center justify-between text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            <span>+ {rest.length} outras</span>
            <span className="gd-mono"><Money cents={restTotal} /></span>
          </div>
        )}
      </div>
    </div>
  )
}
