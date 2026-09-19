import { P2 } from '@/lib/casal'
import { Money } from '@/components/money'
import { PaceBar } from './pace-bar'
import type { MonthColumn } from '../_lib/build-corridor'

export function MonthCard({ col }: { col: MonthColumn }) {
  return (
    <div className={`rounded-xl border p-4 ${col.isCurrent ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium capitalize">{col.label}</h3>
        {col.isCurrent && <span className="text-xs text-[var(--accent)]">mês corrente</span>}
      </div>

      {col.projecao && <PaceBar p={col.projecao} />}

      {!col.isCurrent && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--ink-soft)]">gasto típico + fixas</span>
          <Money cents={col.variavel + col.fixas} />
        </div>
      )}

      {col.trombadoes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {col.trombadoes.map((h) => (
            <li key={h.bill.id} className="flex items-center justify-between rounded-lg bg-[var(--warn-soft)] px-2 py-1 text-sm text-[var(--warn)]">
              <span>⚠️ {h.bill.emoji} {h.bill.name}{h.installmentLabel ? ` — ${h.installmentLabel}` : ''}</span>
              <Money cents={h.amount_cents} />
            </li>
          ))}
        </ul>
      )}

      {col.projecao && col.projecao.extraordinario > 0 && (
        /* Compra unica grande nao disputa o teto — aparece, mas fora da conta. */
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          + <Money cents={col.projecao.extraordinario} /> em compras únicas — fora do teto
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-2 text-sm">
        <span className="text-[var(--ink-soft)]">sobra do teto</span>
        {col.sobra === null ? (
          <span className="text-[var(--ink-softer)]">sem teto definido</span>
        ) : (
          <span className={col.sobra >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
            <Money cents={col.sobra} />
          </span>
        )}
      </div>

      {col.settlement && col.settlement.pessoa1 !== 0 && (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-[var(--ink-soft)]">entre vocês</span>
          {col.settlement.pessoa1 > 0 ? (
            <span style={{ color: 'var(--je)' }}>
              {P2.short} te deve <Money cents={col.settlement.pessoa1} />
            </span>
          ) : (
            <span style={{ color: 'var(--na)' }}>
              Você deve à {P2.short} <Money cents={Math.abs(col.settlement.pessoa1)} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
