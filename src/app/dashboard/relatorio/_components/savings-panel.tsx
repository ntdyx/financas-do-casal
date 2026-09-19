import { Money } from '@/components/money'
import type { SavingInsight, SavingsReport, MerchantData, CategoryData, MiudosData, SubscriptionsData } from '../_lib/insights'

/** Título + detalhe por tipo de insight. Números via <Money> pra respeitar "Esconder valores". */
function InsightBody({ ins }: { ins: SavingInsight }) {
  const muted = { color: 'var(--ink-soft)' }
  if (ins.kind === 'merchant') {
    const d = ins.data as MerchantData
    return (
      <>
        <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>{d.name} subiu de ritmo</div>
        <div className="mt-0.5 text-[12.5px]" style={muted}>
          {d.count} compras esse mês (<b style={{ color: 'var(--negative)' }}>+{d.delta}</b> vs mês passado) · <Money cents={d.totalCents} /> no total
        </div>
      </>
    )
  }
  if (ins.kind === 'category') {
    const d = ins.data as CategoryData
    return (
      <>
        <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>{d.cat} {d.pct}% acima da média</div>
        <div className="mt-0.5 text-[12.5px]" style={muted}>
          <Money cents={d.currentCents} /> este mês vs <Money cents={d.mediaCents} /> de média ({d.janela}m)
        </div>
      </>
    )
  }
  if (ins.kind === 'miudos') {
    const d = ins.data as MiudosData
    return (
      <>
        <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>{d.count} comprinhas miúdas</div>
        <div className="mt-0.5 text-[12.5px]" style={muted}>
          abaixo de R$ 25, somam <Money cents={d.totalCents} /> — o vilão invisível
        </div>
      </>
    )
  }
  const d = ins.data as SubscriptionsData
  return (
    <>
      <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
        <Money cents={d.monthlyCents} />/mês em assinaturas
      </div>
      <div className="mt-0.5 text-[12.5px]" style={muted}>
        = <Money cents={d.annualCents} />/ano
        {d.increase && (
          <> · {d.increase.name} subiu <Money cents={d.increase.fromCents} /> → <Money cents={d.increase.toCents} /></>
        )}
      </div>
    </>
  )
}

export function SavingsPanel({ report }: { report: SavingsReport }) {
  if (report.insights.length === 0) return null
  return (
    <div className="rounded-[18px] p-4 sm:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[15.5px] font-bold" style={{ color: 'var(--ink)' }}>Onde dá pra economizar</span>
        <span className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>os maiores vazamentos do mês</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {report.insights.map((ins) => (
          <div key={ins.id} className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <span className="text-[19px] leading-tight">{ins.icon}</span>
            <div className="min-w-0 flex-1"><InsightBody ins={ins} /></div>
            {ins.savingCents !== null && (
              <div className="shrink-0 text-right">
                <div className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{ins.kind === 'subscriptions' ? 'aumento' : 'economia'}</div>
                <div className="gd-mono text-[14px] font-bold" style={{ color: 'var(--negative)' }}>~<Money cents={ins.savingCents} /></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {(report.potentialCents > 0 || report.positive) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[12.5px]" style={{ borderColor: 'var(--line)' }}>
          {report.positive ? (
            <span style={{ color: 'var(--positive)' }}>✓ {report.positive.cat} veio {report.positive.pct}% abaixo — mandou bem</span>
          ) : <span />}
          {report.potentialCents > 0 && (
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>potencial ~<span style={{ color: 'var(--negative)' }}><Money cents={report.potentialCents} /></span></span>
          )}
        </div>
      )}
    </div>
  )
}
