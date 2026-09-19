import { Money } from '@/components/money'
import type { Projecao } from '../_lib/forecast'

const SELO: Record<Projecao['ritmo'], { txt: string; cls: string }> = {
  'acelerado': { txt: 'acelerado', cls: 'bg-[var(--negative-soft)] text-[var(--negative)]' },
  'no-ritmo':  { txt: 'no ritmo',  cls: 'bg-[var(--line)] text-[var(--ink-soft)]' },
  'devagar':   { txt: 'devagar',   cls: 'bg-[var(--positive-soft)] text-[var(--positive)]' },
}

export function PaceBar({ p }: { p: Projecao }) {
  const s = SELO[p.ritmo]
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between">
        <span className="text-[var(--ink-soft)]">variável correndo</span>
        <Money cents={p.correndo} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--ink-soft)]">projeção de fechamento</span>
        <span className="flex items-center gap-2">
          <Money cents={p.projetadoFechar} />
          <span className={`rounded-full px-2 py-0.5 text-xs ${s.cls}`}>{s.txt}</span>
        </span>
      </div>
    </div>
  )
}
