import { P1, P2 } from '@/lib/casal'
import { Suspense } from 'react'
import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Money } from '@/components/money'
import { prettyName } from '@/lib/merchants'
import { effectiveName } from '@/lib/rules'
import { computeFixedBills, computeExpectedDays } from '@/lib/fixed'
import { computeSettlement } from '@/lib/settlement'
import { MonthNav } from '@/components/month-nav'
import { PersonalSpend, type SpendCat } from './_components/personal-spend'
import { fetchAllPages, PG_MAX_ROWS } from '@/lib/paginate'
import { computeMesExtra, disponivelDoMes, type ExtraTx } from '@/lib/mes-extra'
import { capForMonth, type SpendCapRow } from '@/lib/spend-cap'
import { computeRecurring, type HistTx as InsightsTx } from './relatorio/_lib/insights'
import { mesesBase, baseline, projetaFatura, sobraPrevista, type HistTx } from './previsao/_lib/forecast'
import { plannedForMonth, type PlannedBill } from './previsao/_lib/planned'
import { MesCard } from './_components/mes-card'
import { ContasAPagar } from './_components/contas-a-pagar'

interface Props {
  searchParams: Promise<{ mes?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams
  const user = await getUser()
  const supabase = await createClient()

  const now = new Date()
  const mes = sp.mes ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = mes.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().slice(0, 10)

  const [{ data: txs }, closingRes, { data: fixedBillDefs }, { data: fixedHistory }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount_cents, payer, split_mine_pct, transaction_date, description, note, is_fixed, fixed_bill_id, categories(id, name, emoji, color), accounts(owner)')
      .eq('user_id', user!.id)
      .eq('is_transfer', false)
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .order('transaction_date', { ascending: false }),
    supabase
      .from('monthly_closings')
      .select('closed_at')
      .eq('user_id', user!.id)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabase
      .from('fixed_bills')
      .select('id, name, emoji, position, started_on, ended_on')
      .eq('user_id', user!.id)
      .order('position', { ascending: true })
      .order('name', { ascending: true }),
    // histórico de pagamentos fixos (meses anteriores) pro "dia esperado"
    supabase
      .from('transactions')
      .select('fixed_bill_id, transaction_date')
      .eq('user_id', user!.id)
      .not('fixed_bill_id', 'is', null)
      .lt('transaction_date', start)
      // Histórico de contas fixas: hoje ~80 linhas. PG_MAX_ROWS deixa claro que
      // 1000 é o teto real do PostgREST — `.limit(3000)` nunca trouxe 3000.
      .limit(PG_MAX_ROWS),
  ])

  const closing = closingRes.data as { closed_at: string } | null

  // Marcações manuais de "conta resolvida" deste mês. A home não lia isso, então
  // uma conta que ela resolveu no Fechamento (paga fora das contas sincronizadas,
  // ou paga em outro mês) continuava aparecendo aqui como "não caiu" — e o cron
  // ainda mandava e-mail cobrando.
  const { data: fixedMarks } = await supabase
    .from('fixed_bill_marks')
    .select('bill_id, note')
    .eq('user_id', user!.id)
    .eq('month', mes)

  const rows = txs ?? []
  const gastos = rows.filter((t) => t.amount_cents < 0)

  // categorias (pros seletores nos donuts de gasto pessoal — trocar já aprende)
  const { data: categories } = await supabase
    .from('categories').select('id, name, emoji, color, user_id').order('name')
  const catList = categories ?? []

  // Contas fixas do mês: quais das contas definidas já caíram neste mês.
  const fixedBills = computeFixedBills(fixedBillDefs, gastos, fixedMarks ?? [], mes)
  const fixedPaidCount = fixedBills.filter((b) => b.paid).length
  const fixedTotal = fixedBills.length
  const fixedPaidTotal = fixedBills.reduce((s, b) => s + b.amount, 0)
  const fixedPct = fixedTotal > 0 ? Math.round((fixedPaidCount / fixedTotal) * 100) : 0
  const fixedAllPaid = fixedTotal > 0 && fixedPaidCount === fixedTotal

  // Dia esperado (aprendido) + status de atraso das contas fixas.
  const expectedDays = computeExpectedDays(fixedHistory ?? [])
  const nowMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const isCurrentMonth = mes === nowMes
  const isPastMonth = mes < nowMes
  const todayDay = now.getDate()
  // atrasada = mês corrente, não caiu e já passou o dia habitual dela
  const isOverdue = (id: string) => {
    const exp = expectedDays.get(id)
    return isCurrentMonth && exp != null && todayDay > exp
  }
  // só gastos divididos (mesma regra do acerto: ignora 100% / sem divisão)
  const divididos = gastos.filter(
    (t) => t.split_mine_pct !== null && t.split_mine_pct !== 0 && t.split_mine_pct !== 100,
  )
  const totalSaidas = divididos.reduce((s, t) => s + Math.abs(t.amount_cents), 0)

  const settlement = computeSettlement(
    gastos.map((t) => ({
      amount_cents: t.amount_cents,
      split_mine_pct: t.split_mine_pct,
      owner: (Array.isArray(t.accounts) ? t.accounts[0] : t.accounts)?.owner ?? null,
    })),
  )

  // Gastos por categoria
  const byCat = new Map<string, { id: string | null; name: string; emoji: string; color: string; total: number }>()
  for (const t of divididos) {
    const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
    const key = c?.name ?? 'Sem categoria'
    const prev = byCat.get(key) ?? { id: c?.id ?? null, name: key, emoji: c?.emoji ?? '📦', color: c?.color ?? '#9ca3af', total: 0 }
    prev.total += Math.abs(t.amount_cents)
    byCat.set(key, prev)
  }
  const cats = Array.from(byCat.values()).sort((a, b) => b.total - a.total).slice(0, 6)

  // --- Card do mes: "todo mes" vs "extra" ---
  // A sobra do rodape usa EXATAMENTE os mesmos argumentos que /api/cron/ritmo,
  // pra o e-mail e a home nunca darem numeros diferentes no mesmo dia.
  const extra = computeMesExtra(gastos as ExtraTx[])
  const base = mesesBase(now)
  const janelaStart = `${base[0]}-01`
  // Nao ha mais query de entradas: renda saiu do modelo. A regua e o teto.
  const [histTxs, capRes, plannedRes] = await Promise.all([
    fetchAllPages<HistTx>((from, to) => supabase
      .from('transactions')
      .select('amount_cents, transaction_date, is_fixed, fixed_bill_id, categories(name)')
      .eq('user_id', user!.id).eq('is_transfer', false).lt('amount_cents', 0)
      .gte('transaction_date', janelaStart).lte('transaction_date', end)
      .order('id', { ascending: true }).range(from, to)),
    supabase.from('spend_caps').select('amount_cents, effective_from').eq('user_id', user!.id).order('effective_from', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('planned_bills').select('*').eq('user_id', user!.id),
  ])

  const b = baseline(histTxs, base)
  const trombadoes = plannedForMonth((plannedRes.data ?? []) as PlannedBill[], mes)
    .reduce((acc, h) => acc + h.amount_cents, 0)
  const projecao = isCurrentMonth ? projetaFatura(gastos as HistTx[], now, b.rotinaTipica) : null
  const caps = (capRes.data ?? []) as SpendCapRow[]
  const teto = capForMonth(caps, mes)
  // Saldo: o que ainda da pra gastar hoje. E o numero que a pessoa usa pra decidir.
  // Sem teto combinado nao ha resposta — o card mostra "defina o teto" em vez de
  // inventar um numero.
  const disponivel = teto == null
    ? null
    : disponivelDoMes({ teto, fixoTipico: b.fixoTipico, trombadoes, extra })
  // Projecao: como o mes termina se o ritmo continuar. Informa, mas nao decide —
  // e o mesmo calculo que dispara o e-mail em /api/cron/ritmo.
  const sobra = teto == null ? null : sobraPrevista({
    teto,
    fixas: b.fixoTipico,
    variavel: projecao ? projecao.projetadoFechar : b.rotinaTipica,
    trombadoes,
  })
  // Teto ja combinado que so entra em vigor no mes que vem. Sem mostrar isto,
  // quem acabou de definir um teto nao ve nada mudar e acha que nao salvou.
  const proxDate = new Date(year, month, 1)
  const proxYm = `${proxDate.getFullYear()}-${String(proxDate.getMonth() + 1).padStart(2, '0')}`
  const tetoProx = capForMonth(caps, proxYm)
  const tetoFuturo = tetoProx !== null && tetoProx !== teto
    ? { valor: tetoProx, mes: proxDate.toLocaleDateString('pt-BR', { month: 'long' }) }
    : null
  const recorrentes = computeRecurring(gastos as InsightsTx[], mes)

  // Gasto pessoal de cada uma (100% de uma só — fora da divisão): agrupa por
  // categoria já com os gastos que a compõem, pro donut clicável.
  const groupByCat = (list: typeof gastos): SpendCat[] => {
    const m = new Map<string, SpendCat>()
    for (const t of list) {
      const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
      const key = c?.name ?? 'Sem categoria'
      const g: SpendCat = m.get(key) ?? { name: key, emoji: c?.emoji ?? '📦', color: c?.color ?? '#9ca3af', total: 0, items: [] }
      const amount = Math.abs(t.amount_cents)
      g.total += amount
      g.items.push({ id: t.id, name: prettyName(effectiveName(t)), amount, date: t.transaction_date, category: c ?? null, split: t.split_mine_pct })
      m.set(key, g)
    }
    return Array.from(m.values())
      .map((g) => ({ ...g, items: g.items.sort((a, b) => b.amount - a.amount) }))
      .sort((a, b) => b.total - a.total)
  }
  const pessoalNat = gastos.filter((t) => t.split_mine_pct === 100)
  const pessoalJen = gastos.filter((t) => t.split_mine_pct === 0)
  const totalPessoalNat = pessoalNat.reduce((s, t) => s + Math.abs(t.amount_cents), 0)
  const totalPessoalJen = pessoalJen.reduce((s, t) => s + Math.abs(t.amount_cents), 0)
  const catsNat = groupByCat(pessoalNat)
  const catsJen = groupByCat(pessoalJen)

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })

  // Acerto do mês (direção da dívida)
  const diff = Math.abs(settlement.pessoa1)
  const natOwes = settlement.pessoa1 < 0
  const payer = natOwes ? P1.name : P2.name
  const receiver = natOwes ? P2.name : P1.name

  const closed = !!closing
  const semDivida = diff === 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* Headline */}
      <div className="flex flex-col gap-3">
        <MonthNav current={mes} />
        <h1
          className="gd-display text-[54px] leading-[0.95] sm:text-[62px]"
          style={{ letterSpacing: '-0.04em', color: 'var(--ink)' }}
        >
          quem deve<br />pra quem{' '}
          <span style={{ color: 'var(--accent)' }}>✦</span>
        </h1>
      </div>

      {/* O que precisa ser pago: atrasado, vencendo hoje, e o que vem essa semana.
          Substituiu o aviso antigo de "conta fixa atrasada", que se baseava no dia
          MEDIANO de pagamento (aprendia o atraso) e ignorava as contas resolvidas
          na mão — cobrava conta já paga e calava sobre conta sem histórico. */}
      <Suspense fallback={null}>
        <ContasAPagar mes={mes} />
      </Suspense>

      {/* Duas colunas */}
      <div className="grid items-start gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        {/* ESQUERDA */}
        <div className="flex flex-col gap-[18px]">
          {/* Acerto do mês (azul) */}
          <section className="relative overflow-hidden rounded-[22px] px-[26px] pb-[22px] pt-6" style={{ background: 'var(--blue)' }}>
            <div className="relative z-[1]">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold" style={{ color: 'var(--blue-ink)' }}>Acerto do mês</span>
                <span className="flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[12px] font-bold capitalize" style={{ background: 'rgba(255,255,255,.55)', color: 'var(--blue-ink)' }}>{monthLabel}</span>
              </div>

              {closed ? (
                <div className="mt-3.5 gd-display text-4xl" style={{ color: 'var(--ink)' }}>Mês fechado ✓</div>
              ) : (
                <div className="mt-3.5 gd-mono text-[52px] font-extrabold leading-none" style={{ letterSpacing: '-0.035em', color: 'var(--ink)' }}>
                  <Money cents={diff} />
                </div>
              )}

              <div className="mt-2 text-[14px] font-semibold" style={{ color: 'var(--blue-ink)' }}>
                {semDivida ? 'contas equilibradas — ninguém deve nada' : `${payer} deve pra ${receiver}`}
              </div>

              <Link
                href={`/dashboard/fechamento?mes=${mes}`}
                className="mt-[18px] inline-flex items-center gap-2 rounded-[11px] px-4 py-2.5 text-[13.5px] font-bold transition-[filter] hover:brightness-[0.97]"
                style={{ background: 'var(--lime)', color: 'var(--lime-ink)' }}
              >
                {closed ? 'ver fechamento' : 'ver acerto'}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>

              {/* parte vs pago — apoio */}
              <div className="mt-5 grid grid-cols-2 gap-x-5 border-t pt-3" style={{ borderColor: 'rgba(23,60,78,.18)' }}>
                <PagouLinha name={P1.name} share={settlement.pessoa1_share} paid={settlement.pessoa1_paid} />
                <PagouLinha name={P2.name} share={settlement.pessoa2_share} paid={settlement.pessoa2_paid} align="right" />
              </div>
            </div>
          </section>

          {/* Últimas transações */}
          <section className="rounded-[18px] px-5 pb-2 pt-[18px]" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[15.5px] font-bold" style={{ color: 'var(--ink)' }}>Últimas transações</span>
              <Link href="/dashboard/transacoes" className="text-[13px] font-semibold" style={{ color: 'var(--ink-soft)' }}>ver todas →</Link>
            </div>
            {gastos.length === 0 && <p className="py-3 text-sm" style={{ color: 'var(--ink-softer)' }}>Sem gastos neste mês.</p>}
            {gastos.slice(0, 6).map((t, i) => {
              const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
              return (
                <div key={i} className="grid grid-cols-[42px_1fr_auto] items-center gap-3.5 border-t py-3" style={{ borderColor: 'var(--line)' }}>
                  <span className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-[19px]" style={{ background: 'var(--surface-2)' }}>{c?.emoji ?? '📦'}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>{prettyName(effectiveName(t))}</div>
                    <div className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-soft)' }}>{c?.name ?? 'Sem categoria'}</div>
                  </div>
                  <div className="gd-mono text-right text-[14.5px] font-bold" style={{ color: 'var(--ink)' }}><Money cents={Math.abs(t.amount_cents)} /></div>
                </div>
              )
            })}
          </section>
        </div>

        {/* DIREITA */}
        <div className="flex flex-col gap-[18px]">
          {/* Contas fixas do mês */}
          {fixedTotal > 0 && (
            <section className="rounded-[18px] p-5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-[15px] font-bold" style={{ color: 'var(--ink)' }}>
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]" style={{ background: 'var(--je-soft)', color: 'var(--je)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5h18v9H3zM3 11h18" /></svg>
                  </span>
                  Contas fixas
                </span>
                <span className="text-[12.5px] font-semibold" style={{ color: fixedAllPaid ? 'var(--accent)' : 'var(--ink-soft)' }}>{fixedPaidCount}/{fixedTotal} pagas</span>
              </div>
              <div className="mt-3.5 gd-mono text-[26px] font-extrabold" style={{ letterSpacing: '-0.02em', color: 'var(--ink)' }}><Money cents={fixedPaidTotal} /></div>
              <div className="mt-3.5 h-[7px] overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
                <div className="h-full rounded-full" style={{ width: `${fixedPct}%`, background: 'var(--accent)' }} />
              </div>
              {fixedAllPaid ? (
                <p className="mt-2.5 text-[12px] font-medium" style={{ color: 'var(--accent)' }}>✓ todas já caíram este mês 🎉</p>
              ) : (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {fixedBills.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0" style={{ color: b.paid ? 'var(--accent)' : 'var(--ink-softer)' }}>{b.paid ? '✓' : '○'}</span>
                        <span className="truncate" style={{ color: b.paid ? 'var(--ink)' : 'var(--ink-2)' }}>{b.emoji} {b.label}</span>
                      </span>
                      {b.paid ? (
                        <span className="gd-mono shrink-0 font-semibold" style={{ color: 'var(--ink)' }}><Money cents={b.amount} /></span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isCurrentMonth && expectedDays.get(b.id) != null && (
                            <span className="text-[11px]" style={{ color: 'var(--ink-softer)' }}>~dia {expectedDays.get(b.id)}</span>
                          )}
                          {isPastMonth || isOverdue(b.id) ? (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--negative-soft, rgba(220,38,38,.10))', color: 'var(--negative)' }}>
                              {isPastMonth ? 'não caiu' : 'atrasada'}
                            </span>
                          ) : (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>a vencer</span>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <MesCard
            mes={mes}
            extra={extra}
            teto={teto}
            tetoFuturo={tetoFuturo}
            recorrentes={recorrentes.items.map((i) => ({ name: i.name, amount: i.amount, prevAmount: i.prevAmount }))}
            recorrenteTipico={b.fixoTipico}
            rotinaTipica={b.rotinaTipica}
            disponivel={disponivel}
            sobraPrevista={projecao ? sobra : null}
          />

          {/* Gastos por categoria */}
          <section className="rounded-[18px] px-5 pb-3.5 pt-[18px]" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Gastos por categoria</span>
              <Link href={`/dashboard/relatorio?mes=${mes}&dono=casal`} className="text-[12.5px] font-semibold" style={{ color: 'var(--ink-soft)' }}>ver →</Link>
            </div>
            {cats.length === 0 && <p className="py-2 text-sm" style={{ color: 'var(--ink-softer)' }}>Sem gastos neste mês.</p>}
            {cats.map((c) => {
              const pct = totalSaidas > 0 ? Math.round((c.total / totalSaidas) * 100) : 0
              const href = `/dashboard/relatorio?mes=${mes}&dono=casal&cat=${encodeURIComponent(c.name)}`
              return (
                <Link key={c.name} href={href} className="block py-[9px]">
                  <div className="flex items-center justify-between">
                    <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}><span className="text-[15px]">{c.emoji}</span><span className="truncate">{c.name}</span></span>
                    <span className="gd-mono shrink-0 text-[13px]" style={{ color: 'var(--ink-2)' }}><Money cents={c.total} /> <span style={{ color: 'var(--ink-soft)' }}>· {pct}%</span></span>
                  </div>
                  <div className="mt-[7px] h-[5px] overflow-hidden rounded-full" style={{ background: 'var(--bg)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                </Link>
              )
            })}
          </section>
        </div>
      </div>

      {/* Gastos pessoais de cada uma (100%, fora da divisão) */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="gd-display text-2xl" style={{ color: 'var(--ink)' }}>Gastos pessoais</h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>100%, fora da divisão — toque numa fatia pra ver os gastos</p>
        </div>
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <PersonalSpend variant="nat" name={P1.name} color="var(--na)" total={totalPessoalNat} cats={catsNat} categories={catList} href={`/dashboard/relatorio?mes=${mes}&dono=nat`} />
          <PersonalSpend variant="jen" name={P2.name} color="var(--je)" total={totalPessoalJen} cats={catsJen} categories={catList} href={`/dashboard/relatorio?mes=${mes}&dono=jen`} />
        </div>
      </section>
    </div>
  )
}

function PagouLinha({ name, share, paid, align }: { name: string; share: number; paid: number; align?: 'right' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`text-[11px] font-bold ${align === 'right' ? 'text-right' : ''}`} style={{ color: 'var(--blue-ink)' }}>{name}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px]" style={{ color: 'rgba(23,60,78,.7)' }}>parte</span>
        <span className="gd-mono text-[13px] font-semibold" style={{ color: 'var(--blue-ink)' }}><Money cents={share} /></span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px]" style={{ color: 'rgba(23,60,78,.7)' }}>pagou</span>
        <span className="gd-mono text-[13px] font-semibold" style={{ color: 'var(--blue-ink)' }}><Money cents={paid} /></span>
      </div>
    </div>
  )
}

