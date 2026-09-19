import { P1, P2 } from '@/lib/casal'
import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Money } from '@/components/money'
import { prettyName } from '@/lib/merchants'
import { effectiveName } from '@/lib/rules'
import { MonthNav } from '@/components/month-nav'
import { PersonFace } from '@/components/person-face'
import { ReportChart, type RepCat } from './_components/report-chart'
import { InsightsHeader } from './_components/insights-header'
import { RecurringBlock } from './_components/recurring-block'
import { SavingsPanel } from './_components/savings-panel'
import { computeFaixa, sparkline, janelaFromParam, monthsBefore, computeCatBadges, computeRecurring, computeMiudos, computeMerchantSummaries, computeSavingsInsights, MIUDO_MAX, type HistTx } from './_lib/insights'

interface Props {
  searchParams: Promise<{ mes?: string; dono?: string; cat?: string; med?: string }>
}

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const PESSOAS = {
  nat: { key: 'nat', name: P1.name, initial: P1.initial, who: 'nat', color: 'var(--na)', soft: 'var(--na-soft)', split: 100 },
  jen: { key: 'jen', name: P2.name, initial: P2.initial, who: 'jen', color: 'var(--je)', soft: 'var(--je-soft)', split: 0 },
  casal: { key: 'casal', name: 'Casal', initial: '½', who: null, color: 'var(--accent)', soft: 'var(--accent-soft)', split: null },
} as const

const fmtDay = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MESES_CURTO[Number(m) - 1]}`
}

export default async function RelatorioPage({ searchParams }: Props) {
  const sp = await searchParams
  const user = await getUser()
  const supabase = await createClient()

  const dono = sp.dono === 'jen' ? 'jen' : sp.dono === 'casal' ? 'casal' : 'nat'
  const pessoa = PESSOAS[dono]
  const dividido = dono === 'casal'

  const now = new Date()
  const mes = sp.mes ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = mes.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().slice(0, 10)
  const mesLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // pessoa: 100% dela (nat=100, jen=0). casal: só os divididos (split != 0/100 e não nulo).
  const base = supabase
    .from('transactions')
    .select('id, amount_cents, transaction_date, description, note, installment_number, total_installments, categories(id, name, emoji, color), accounts(name)')
    .eq('user_id', user!.id)
    .eq('is_transfer', false)
    .lt('amount_cents', 0)
    .gte('transaction_date', start)
    .lte('transaction_date', end)
    .order('amount_cents', { ascending: true })

  const [{ data: txs }, { data: categories }] = await Promise.all([
    dividido
      ? base.not('split_mine_pct', 'is', null).neq('split_mine_pct', 0).neq('split_mine_pct', 100)
      : base.eq('split_mine_pct', pessoa.split),
    supabase.from('categories').select('id, name, emoji, color, user_id').order('name'),
  ])

  const gastos = txs ?? []
  const catList = categories ?? []

  // Agrupa por categoria já com os gastos que a compõem.
  const byCat = new Map<string, RepCat>()
  for (const t of gastos) {
    const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
    const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
    const key = c?.name ?? 'Sem categoria'
    const g: RepCat = byCat.get(key) ?? { name: key, emoji: c?.emoji ?? '📦', color: c?.color ?? '#9ca3af', total: 0, items: [] }
    const amount = Math.abs(t.amount_cents)
    g.total += amount
    g.items.push({
      id: t.id,
      name: prettyName(effectiveName(t)),
      date: fmtDay(t.transaction_date as string),
      account: acc?.name ?? '—',
      amount,
      installment: t.total_installments && t.total_installments > 1 ? `${t.installment_number ?? '?'}/${t.total_installments}` : null,
      category: c ? { id: c.id, name: c.name, emoji: c.emoji, color: c.color } : null,
    })
    byCat.set(key, g)
  }
  const cats = Array.from(byCat.values())
    .map((g) => ({ ...g, items: g.items.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.total - a.total)

  const janela = janelaFromParam(sp.med)
  const histStartYm = monthsBefore(mes, 6)[5] // 6 meses atrás
  const histStart = `${histStartYm}-01`

  // filtro por visão idêntico ao do mês, mas sobre 7 meses — pagina (limite 1000).
  const PAGE = 1000
  const hist: HistTx[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('transactions')
      .select('amount_cents, transaction_date, is_fixed, fixed_bill_id, description, note, categories(name)')
      .eq('user_id', user!.id)
      .eq('is_transfer', false)
      .lt('amount_cents', 0)
      .gte('transaction_date', histStart)
      .lte('transaction_date', end)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    q = dividido
      ? q.not('split_mine_pct', 'is', null).neq('split_mine_pct', 0).neq('split_mine_pct', 100)
      : q.eq('split_mine_pct', pessoa.split)
    const { data } = await q
    if (!data || data.length === 0) break
    hist.push(...(data as unknown as HistTx[]))
    if (data.length < PAGE) break
  }

  const faixa = computeFaixa(hist, mes, janela)
  const spark = sparkline(hist, mes)
  const badges = computeCatBadges(hist, mes, janela)
  const merchants = computeMerchantSummaries(hist, mes)
  const catsComBadge = cats.map((c) => ({ ...c, badge: badges.get(c.name) ?? null, merchants: merchants.get(c.name) ?? null }))
  const rec = computeRecurring(hist, mes)
  const miudos = computeMiudos(hist, mes)
  const miudoMaxReais = Math.round(MIUDO_MAX / 100)
  const savings = computeSavingsInsights(hist, mes, janela)

  const total = cats.reduce((s, c) => s + c.total, 0)
  const maior = gastos[0] ? { name: prettyName(effectiveName(gastos[0])), amount: Math.abs(gastos[0].amount_cents) } : null
  const parceladas = gastos.filter((t) => t.total_installments && t.total_installments > 1)
  const parceladasTotal = parceladas.reduce((s, t) => s + Math.abs(t.amount_cents), 0)

  const kpis = [
    { label: 'Total gasto', value: <Money cents={total} />, sub: mesLabel, color: 'var(--ink)' },
    { label: 'Categorias', value: String(cats.length), sub: 'com gastos no mês', color: 'var(--ink)' },
    { label: 'Maior gasto', value: maior ? <Money cents={maior.amount} /> : '—', sub: maior?.name ?? 'sem gastos', color: 'var(--negative)' },
    { label: 'Parcelados', value: <Money cents={parceladasTotal} />, sub: `${parceladas.length} lançamento(s)`, color: 'var(--ink-2)' },
  ]

  const other = dono === 'nat' ? 'jen' : 'nat'

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {/* topo: pessoa + troca + mês */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold" style={{ background: pessoa.color, color: 'var(--bg)' }}>{pessoa.who ? <PersonFace who={pessoa.who} /> : pessoa.initial}</span>
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            {(['nat', 'jen', 'casal'] as const).map((k) => (
              <Link
                key={k}
                href={`/dashboard/relatorio?mes=${mes}&dono=${k}`}
                className="rounded-full px-3 py-1 text-[13px] font-semibold transition-colors"
                style={dono === k ? { background: PESSOAS[k].color, color: 'var(--bg)' } : { color: 'var(--ink-soft)' }}
              >{PESSOAS[k].name}</Link>
            ))}
          </div>
        </div>
        <MonthNav current={mes} />
      </div>

      {/* header */}
      <div>
        <Link href={`/dashboard?mes=${mes}`} className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>← início</Link>
        <h1 className="mt-2 gd-display text-3xl" style={{ color: 'var(--ink)' }}>{dividido ? 'Gastos divididos' : `Gastos pessoais de ${pessoa.name}`}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
          {dividido
            ? 'divididos entre vocês · clique numa categoria para ver os gastos detalhados'
            : '100% dela, fora da divisão · clique numa categoria para ver os gastos detalhados'}
        </p>
      </div>

      {savings.insights.length > 0 && <SavingsPanel report={savings} />}

      {(faixa.totalMes > 0 || faixa.media > 0) && (
        <InsightsHeader faixa={faixa} janela={janela} spark={spark} color={pessoa.color} />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="gd-row p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--ink-soft)' }}>{k.label}</div>
            <div className="gd-mono mt-1.5 text-[21px] font-extrabold tracking-[-0.02em]" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-1 truncate text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <RecurringBlock rec={rec} />

      {miudos.count > 0 && (
        <div className="flex items-center justify-between rounded-[14px] px-4 py-3 text-[13px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--ink)' }}>{miudos.count}</b> compras abaixo de R$ {miudoMaxReais}
          </span>
          <span className="gd-mono font-bold" style={{ color: 'var(--ink)' }}><Money cents={miudos.total} /></span>
        </div>
      )}

      {/* gráfico + detalhe */}
      {cats.length === 0 ? (
        <div className="gd-empty text-sm">
          {dividido ? 'Sem gastos divididos neste mês.' : `${pessoa.name} não tem gastos pessoais neste mês.`}
        </div>
      ) : (
        <ReportChart cats={catsComBadge} total={total} color={pessoa.color} categories={catList} initialCat={sp.cat} />
      )}
    </div>
  )
}
