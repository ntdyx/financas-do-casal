import { P1, P2 } from '@/lib/casal'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Suspense } from 'react'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Money } from '@/components/money'
import { computeSettlement, isDividido, type SettlementRow } from '@/lib/settlement'
import { computeFixedBills, computeExpectedDays, type FixedBill } from '@/lib/fixed'
import { MonthNav } from '@/components/month-nav'
import { prettyName } from '@/lib/merchants'
import { effectiveName } from '@/lib/rules'
import { CloseButton, ReopenButton } from './_components/close-button'
import { ResolveFixedBill } from './_components/resolve-fixed-bill'
import { DividedByCategory, type DivCat } from './_components/divided-by-category'
import { SpendingChart, type ChartBucket, type ChartCat } from './_components/spending-chart'
import { TransactionList } from '../transacoes/_components/transaction-list'
import { ListSkeleton } from '../_components/skeletons'
import { PG_MAX_ROWS } from '@/lib/paginate'

interface Props {
  searchParams: Promise<{ mes?: string; ano?: string; p?: string; cp?: string; ci?: string; cf?: string }>
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

type FixedBillView = Omit<FixedBill, 'id'>
interface FixedSnapshot {
  paid_count: number
  total: number
  paid_total: number
  bills: FixedBillView[]
}

const ownerOf = (accounts: unknown): string | null =>
  (Array.isArray(accounts) ? accounts[0] : accounts as { owner?: string } | null)?.owner ?? null

interface YearTx {
  amount_cents: number
  split_mine_pct: number | null
  transaction_date: string
  fixed_bill_id: string | null
  accounts: { owner?: string } | { owner?: string }[] | null
}

/** Busca TODAS as transações do ano paginando (o Supabase corta em 1000 por
 *  padrão). Sem isso, meses somem do cálculo de contas fixas e do acerto. */
async function fetchYearTxs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ano: number,
): Promise<YearTx[]> {
  const PAGE = 1000
  const out: YearTx[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('transactions')
      .select('amount_cents, split_mine_pct, transaction_date, fixed_bill_id, accounts(owner)')
      .eq('user_id', userId)
      .eq('is_transfer', false)
      .gte('transaction_date', `${ano}-01-01`)
      .lte('transaction_date', `${ano}-12-31`)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    out.push(...(data as unknown as YearTx[]))
    if (data.length < PAGE) break
  }
  return out
}

export default async function FechamentoPage({ searchParams }: Props) {
  const sp = await searchParams
  // Com ?mes= → detalhe do mês. Sem → calendário do ano.
  if (sp.mes) return <MonthView mes={sp.mes} page={Math.max(1, parseInt(sp.p ?? '1', 10))} />
  const now = new Date()
  const ano = sp.ano ? Number(sp.ano) : now.getFullYear()
  return <CalendarView ano={ano} cp={sp.cp} ci={sp.ci} cf={sp.cf} />
}

/* ─────────────────── Panorama de gastos (gráfico) ─────────────────── */

type ChartPeriod = '3m' | '6m' | 'custom'

interface ChartTx {
  amount_cents: number
  transaction_date: string
  categories: { name: string; emoji: string; color: string } | { name: string; emoji: string; color: string }[] | null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Resolve o intervalo do gráfico a partir dos params. Default: últimos 6 meses. */
function resolveChartRange(cp: string | undefined, ci: string | undefined, cf: string | undefined, now: Date) {
  const period: ChartPeriod = cp === '3m' || cp === 'custom' ? cp : '6m'
  if (period === 'custom' && ci && cf) {
    const [start, end] = ci <= cf ? [ci, cf] : [cf, ci]
    return { period, start, end }
  }
  const months = period === '3m' ? 3 : 6
  const s = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const e = new Date(now.getFullYear(), now.getMonth() + 1, 0) // último dia do mês corrente
  return {
    period: (period === 'custom' ? '6m' : period) as ChartPeriod,
    start: `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-01`,
    end: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`,
  }
}

/** Lista de meses 'YYYY-MM' de start..end (inclusive). */
function monthsBetween(start: string, end: string) {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  const out: string[] = []
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad2(m)}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return `${d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')} ${String(y).slice(-2)}`
}

/** Busca gastos (amount<0, não-transferência) de um intervalo, paginando. */
async function fetchChartTxs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  start: string,
  end: string,
): Promise<ChartTx[]> {
  const PAGE = 1000
  const out: ChartTx[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('transactions')
      .select('amount_cents, transaction_date, categories(name, emoji, color)')
      .eq('user_id', userId)
      .eq('is_transfer', false)
      .lt('amount_cents', 0)
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    out.push(...(data as unknown as ChartTx[]))
    if (data.length < PAGE) break
  }
  return out
}

const TOP_CATS = 8 // além disso vira "Outros"
const OUTROS_COLOR = '#b8b8c4'

/** Agrega os gastos do intervalo em barras (mês) × categoria, prontas pro gráfico. */
function buildChartData(txs: ChartTx[], ymList: string[]) {
  const catMap = new Map<string, ChartCat>()
  const byYm = new Map<string, Map<string, number>>()
  for (const t of txs) {
    const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
    const name = c?.name ?? 'Sem categoria'
    const amt = Math.abs(t.amount_cents)
    const cm = catMap.get(name) ?? { name, emoji: c?.emoji ?? '📦', color: c?.color ?? OUTROS_COLOR, total: 0 }
    cm.total += amt
    catMap.set(name, cm)
    const ym = t.transaction_date.slice(0, 7)
    const mm = byYm.get(ym) ?? new Map<string, number>()
    mm.set(name, (mm.get(name) ?? 0) + amt)
    byYm.set(ym, mm)
  }

  const sorted = [...catMap.values()].sort((a, b) => b.total - a.total)
  let legend: ChartCat[] = sorted
  const restSet = new Set<string>()
  if (sorted.length > TOP_CATS) {
    const rest = sorted.slice(TOP_CATS)
    rest.forEach((c) => restSet.add(c.name))
    legend = [
      ...sorted.slice(0, TOP_CATS),
      { name: 'Outros', emoji: '•', color: OUTROS_COLOR, total: rest.reduce((s, c) => s + c.total, 0) },
    ]
  }

  const buckets: ChartBucket[] = ymList.map((ym) => {
    const mm = byYm.get(ym) ?? new Map<string, number>()
    const parts = legend.map((l) => {
      if (l.name === 'Outros') {
        let s = 0
        for (const [n, v] of mm) if (restSet.has(n)) s += v
        return s
      }
      return mm.get(l.name) ?? 0
    })
    return { ym, label: monthLabel(ym), total: parts.reduce((a, b) => a + b, 0), parts }
  })

  const grandTotal = legend.reduce((s, c) => s + c.total, 0)
  return { legend, buckets, grandTotal }
}

/* ───────────────────────── Calendário do ano ───────────────────────── */

async function CalendarView({ ano, cp, ci, cf }: { ano: number; cp?: string; ci?: string; cf?: string }) {
  const user = await getUser()
  const supabase = await createClient()

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const curMonthStart = `${curY}-${String(curM).padStart(2, '0')}-01`

  const chartRange = resolveChartRange(cp, ci, cf, now)

  const [txs, { data: closings }, { data: fixedBillDefs }, { data: fixedHistory }, { data: marks }, chartTxs] = await Promise.all([
    // O ano inteiro pode passar de 1000 linhas (limite padrão do Supabase); pagina
    // pra não truncar — senão contas fixas "somem" e o acerto sai errado.
    fetchYearTxs(supabase, user!.id, ano),
    supabase
      .from('monthly_closings')
      .select('month, closed_at, snapshot')
      .eq('user_id', user!.id)
      .eq('year', ano),
    supabase.from('fixed_bills').select('id').eq('user_id', user!.id),
    // histórico de pagamentos fixos (antes do mês corrente) pro "dia esperado"
    supabase
      .from('transactions')
      .select('fixed_bill_id, transaction_date')
      .eq('user_id', user!.id)
      .not('fixed_bill_id', 'is', null)
      .lt('transaction_date', curMonthStart)
      // ~90 linhas hoje; 1000 é o teto real do PostgREST de qualquer jeito.
      .limit(PG_MAX_ROWS),
    // resoluções manuais ("paguei em outro mês") — silenciam o alerta
    supabase
      .from('fixed_bill_marks')
      .select('bill_id, month')
      .eq('user_id', user!.id)
      .gte('month', `${ano}-01`)
      .lte('month', `${ano}-12`),
    fetchChartTxs(supabase, user!.id, chartRange.start, chartRange.end),
  ])

  const chart = buildChartData(chartTxs, monthsBetween(chartRange.start, chartRange.end))

  const totalBills = (fixedBillDefs ?? []).length
  // Dia habitual de cada conta fixa (mediana do histórico) — pra saber se uma
  // conta do mês corrente já está atrasada.
  const expectedDays = computeExpectedDays(fixedHistory ?? [])
  const todayDay = now.getDate()

  // Quais contas fixas caíram em cada mês (só gastos com fixed_bill_id).
  const paidBillsByMonth = new Map<number, Set<string>>()
  for (const t of txs ?? []) {
    if (t.amount_cents >= 0 || !t.fixed_bill_id) continue
    const m = Number((t.transaction_date as string).slice(5, 7))
    const set = paidBillsByMonth.get(m) ?? new Set<string>()
    set.add(t.fixed_bill_id)
    paidBillsByMonth.set(m, set)
  }

  // Contas resolvidas na mão em cada mês (pagou em outro mês/fora) — contam como
  // "ok", igual às que caíram, pra não disparar alerta.
  const markedBillsByMonth = new Map<number, Set<string>>()
  for (const mk of (marks ?? []) as { bill_id: string; month: string }[]) {
    const m = Number(mk.month.slice(5, 7))
    const set = markedBillsByMonth.get(m) ?? new Set<string>()
    set.add(mk.bill_id)
    markedBillsByMonth.set(m, set)
  }

  // Em quais meses ('YYYY-MM') cada conta fixa caiu (histórico + ano visto) e
  // qual foi a última vez. Serve pra flagrar falta SÓ em conta mensal: uma conta
  // é "esperada" num mês quando caiu no mês anterior (sinal de que é mensal) e
  // ainda volta a cair depois (não foi cancelada). Assim conta anual/esporádica
  // não vira falso-positivo. Só ids que ainda são contas fixas atuais.
  const billIds = new Set((fixedBillDefs ?? []).map((b) => b.id))
  const seenMonths = new Set<string>()
  const lastSeen = new Map<string, string>()
  const noteSeen = (id: string | null | undefined, date: string) => {
    if (!id || !billIds.has(id)) return
    const mk = date.slice(0, 7)
    seenMonths.add(`${id}:${mk}`)
    const prev = lastSeen.get(id)
    if (!prev || mk > prev) lastSeen.set(id, mk)
  }
  for (const t of fixedHistory ?? []) noteSeen(t.fixed_bill_id, t.transaction_date as string)
  for (const t of txs ?? []) if (t.amount_cents < 0) noteSeen(t.fixed_bill_id, t.transaction_date as string)

  const closedMap = new Map<number, string>()
  for (const c of (closings ?? []) as { month: number; closed_at: string }[]) {
    closedMap.set(c.month, c.closed_at)
  }

  // Agrupa gastos divididos por mês
  const byMonth = new Map<number, SettlementRow[]>()
  for (const t of txs ?? []) {
    if (t.amount_cents >= 0 || !isDividido(t.split_mine_pct)) continue
    const m = Number((t.transaction_date as string).slice(5, 7))
    const arr = byMonth.get(m) ?? []
    arr.push({ amount_cents: t.amount_cents, split_mine_pct: t.split_mine_pct, owner: ownerOf(t.accounts) })
    byMonth.set(m, arr)
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
    const rows = byMonth.get(m) ?? []
    const s = computeSettlement(rows)
    const isFuture = ano > curY || (ano === curY && m > curM)
    const isCurrent = ano === curY && m === curM
    const paidSet = paidBillsByMonth.get(m)
    const markedSet = markedBillsByMonth.get(m)
    // Sinal de atenção quando faltou conta fixa: acusa conta MENSAL que caiu no
    // mês anterior e volta a cair depois, mas faltou aqui — a não ser que tenha
    // caído ou sido resolvida na mão. Vale pra fechado e em aberto.
    let fixedMissing = false
    if (!isFuture && !isCurrent) {
      const monthKey = `${ano}-${String(m).padStart(2, '0')}`
      const prevKey = `${m === 1 ? ano - 1 : ano}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`
      for (const [id, last] of lastSeen) {
        if (monthKey < last && !paidSet?.has(id) && !markedSet?.has(id) && seenMonths.has(`${id}:${prevKey}`)) {
          fixedMissing = true
          break
        }
      }
    }
    // Mês corrente: conta fixa que já passou do dia habitual e não caiu (nem foi resolvida).
    let fixedOverdue = false
    if (isCurrent && totalBills > 0) {
      for (const [id, exp] of expectedDays) {
        if (todayDay > exp && !paidSet?.has(id) && !markedSet?.has(id)) { fixedOverdue = true; break }
      }
    }
    return {
      m,
      diff: Math.abs(s.pessoa1),
      net: s.pessoa1,
      natOwes: s.pessoa1 < 0,
      closedAt: closedMap.get(m) ?? null,
      isFuture,
      hasData: rows.length > 0,
      fixedMissing,
      fixedOverdue,
    }
  })

  // Soma do que ainda não foi acertado no ano (mesmos meses marcados "em aberto").
  const abertos = months.filter((mo) => mo.hasData && !mo.isFuture && !mo.closedAt)
  const saldoAberto = abertos.reduce((acc, mo) => acc + mo.net, 0)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--ink)' }}>Fechamento</h1>
        <div className="flex items-center gap-1.5">
          <Link href={`/dashboard/fechamento?ano=${ano - 1}`} aria-label="Ano anterior" className="grid place-items-center transition-colors hover:bg-black/[0.04]" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13 }}>←</Link>
          <span className="gd-mono text-center" style={{ minWidth: 40, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{ano}</span>
          <Link href={`/dashboard/fechamento?ano=${ano + 1}`} aria-label="Próximo ano" className="grid place-items-center transition-colors hover:bg-black/[0.04]" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13 }}>→</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" style={{ gap: 14 }}>
        {months.map((mo) => (
          <MonthCell key={mo.m} ano={ano} {...mo} />
        ))}
      </div>

      {abertos.length > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2" style={{ borderRadius: 16, padding: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
            Total em aberto ({abertos.length} {abertos.length === 1 ? 'mês' : 'meses'})
          </span>
          {saldoAberto === 0 ? (
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-soft)' }}>equilibrado</span>
          ) : (
            <span style={{ fontSize: 15, color: 'var(--ink)' }}>
              <b style={{ color: saldoAberto < 0 ? 'var(--na)' : 'var(--je)' }}>{saldoAberto < 0 ? P1.name : P2.name}</b> deve{' '}
              <b className="gd-mono"><Money cents={Math.abs(saldoAberto)} /></b> pra{' '}
              <b style={{ color: saldoAberto < 0 ? 'var(--je)' : 'var(--na)' }}>{saldoAberto < 0 ? P2.name : P1.name}</b>
            </span>
          )}
        </div>
      )}

      <div className="mt-8">
        <SpendingChart
          legend={chart.legend}
          buckets={chart.buckets}
          period={chartRange.period}
          start={chartRange.start}
          end={chartRange.end}
          grandTotal={chart.grandTotal}
        />
      </div>
    </div>
  )
}

function MonthCell({ ano, m, diff, natOwes, closedAt, isFuture, hasData, fixedMissing, fixedOverdue }: { ano: number; m: number; diff: number; natOwes: boolean; closedAt: string | null; isFuture: boolean; hasData: boolean; fixedMissing: boolean; fixedOverdue: boolean }) {
  const mes = `${ano}-${String(m).padStart(2, '0')}`
  const closed = !!closedAt
  const open = hasData && !isFuture && !closed
  const equilibrado = hasData && diff === 0
  const vazio = isFuture && !hasData

  return (
    <Link
      href={`/dashboard/fechamento?mes=${mes}`}
      className="flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{
        borderRadius: 16,
        padding: 16,
        gap: 10,
        background: open ? 'var(--accent-soft)' : 'var(--surface)',
        border: `1px solid ${open ? 'var(--accent-soft)' : 'var(--line)'}`,
        opacity: vazio ? 0.45 : 1,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="capitalize" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{MESES_CURTO[m - 1]}</span>
        <StatusDot closed={closed} open={open} />
      </div>

      <div className="min-h-[2.5rem]">
        {vazio ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>a vir</p>
        ) : !hasData ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>sem gastos</p>
        ) : equilibrado ? (
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>equilibrado</p>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
              {natOwes ? `${P1.short} → ${P2.short}` : `${P2.short} → ${P1.short}`}
            </div>
            <div className="gd-mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: 'var(--ink)' }}>
              <Money cents={diff} />
            </div>
          </div>
        )}
      </div>

      <span style={{ fontSize: 11, fontWeight: 600, color: closed ? 'var(--je)' : open ? 'var(--accent)' : 'var(--ink-soft)' }}>
        {closed ? '✓ acertado' : open ? '● em aberto' : ' '}
      </span>
      {fixedMissing ? (
        <span style={{ fontSize: 11, fontWeight: 600, marginTop: 3, color: 'var(--negative)' }}>⚠️ conta fixa não caiu</span>
      ) : fixedOverdue ? (
        <span style={{ fontSize: 11, fontWeight: 600, marginTop: 3, color: 'var(--negative)' }}>⚠️ conta fixa atrasada</span>
      ) : null}
    </Link>
  )
}

function StatusDot({ closed, open }: { closed: boolean; open: boolean }) {
  if (closed) {
    return (
      <span
        className="grid place-items-center"
        style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--je-soft)', color: 'var(--je)', fontSize: 11, fontWeight: 700 }}
      >{'✓'}</span>
    )
  }
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: open ? 'var(--accent)' : 'var(--ink-soft)' }} />
}

/* ───────────────────────── Detalhe do mês ───────────────────────── */

async function MonthView({ mes, page }: { mes: string; page: number }) {
  const user = await getUser()
  const supabase = await createClient()

  const now = new Date()
  const [year, month] = mes.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().slice(0, 10)

  const [{ data: txs }, { count: pendingCount }, closingRes, { data: categories }, { data: fixedBillDefs }, { data: marks }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount_cents, split_mine_pct, fixed_bill_id, is_manual, is_fixed, description, note, transaction_date, categories(id, name, emoji, color), accounts(owner)')
      .eq('user_id', user!.id)
      .eq('is_transfer', false)
      .gte('transaction_date', start)
      .lte('transaction_date', end),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('reviewed', false)
      .eq('is_transfer', false)
      .lt('amount_cents', 0)
      .gte('transaction_date', start)
      .lte('transaction_date', end),
    supabase
      .from('monthly_closings')
      .select('closed_at, snapshot')
      .eq('user_id', user!.id)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabase.from('categories').select('id, name, emoji, color').order('name'),
    supabase.from('fixed_bills').select('id, name, emoji, position').eq('user_id', user!.id)
      .order('position', { ascending: true }).order('name', { ascending: true }),
    supabase.from('fixed_bill_marks').select('bill_id, note').eq('user_id', user!.id).eq('month', mes),
  ])

  const catList = categories ?? []
  const closing = closingRes.data as { closed_at: string; snapshot?: { fixed?: FixedSnapshot } } | null
  const closed = !!closing

  const rows = txs ?? []
  // Contas fixas: quando o mês está fechado, mostra o que ficou registrado no
  // snapshot; senão calcula ao vivo (o mesmo que será gravado ao fechar),
  // já contando as resoluções manuais.
  const fixedBills: FixedBillView[] =
    closing?.snapshot?.fixed?.bills ?? computeFixedBills(fixedBillDefs, rows.filter((t) => t.amount_cents < 0), marks ?? [], mes)
  const billIdByLabel = new Map((fixedBillDefs ?? []).map((b) => [b.name, b.id]))
  const fixedPaidCount = fixedBills.filter((b) => b.paid).length
  const fixedManualCount = fixedBills.filter((b) => b.manual).length
  const fixedResolvedCount = fixedBills.filter((b) => b.paid || b.manual).length
  const fixedPaidTotal = fixedBills.reduce((s, b) => s + b.amount, 0)

  const gastos = rows.filter((t) => t.amount_cents < 0 && isDividido(t.split_mine_pct))
  const totalSaidas = gastos.reduce((s, t) => s + Math.abs(t.amount_cents), 0)

  const settlement = computeSettlement(
    gastos.map((t) => ({ amount_cents: t.amount_cents, split_mine_pct: t.split_mine_pct, owner: ownerOf(t.accounts) })),
  )
  const diff = Math.abs(settlement.pessoa1)
  const natOwes = settlement.pessoa1 < 0
  const total = settlement.pessoa1_share + settlement.pessoa2_share

  const byCat = new Map<string, DivCat>()
  for (const t of gastos) {
    const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
    const key = c?.name ?? 'Sem categoria'
    const g: DivCat = byCat.get(key) ?? { name: key, emoji: c?.emoji ?? '📦', color: c?.color ?? '#9ca3af', total: 0, items: [] }
    const amount = Math.abs(t.amount_cents)
    g.total += amount
    g.items.push({
      id: t.id,
      name: prettyName(effectiveName(t)),
      amount,
      date: t.transaction_date as string,
      category: c ? { id: c.id, name: c.name, emoji: c.emoji, color: c.color } : null,
      splitMinePct: t.split_mine_pct,
      fixedBillId: t.fixed_bill_id,
      isManual: t.is_manual ?? false,
      isFixed: t.is_fixed ?? false,
    })
    byCat.set(key, g)
  }
  const cats = Array.from(byCat.values())
    .map((g) => ({ ...g, items: g.items.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.total - a.total)

  const pend = pendingCount ?? 0
  const isFuture = mes > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const nomeMes = `${MESES[month - 1]} de ${year}`

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3">
        <Link href={`/dashboard/fechamento?ano=${year}`} className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>← calendário {year}</Link>
      </div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="gd-display text-3xl capitalize" style={{ color: 'var(--ink)' }}>{MESES[month - 1]}</h1>
        <MonthNav current={mes} />
      </div>

      {/* Status do mês */}
      <div className="mb-5 gd-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>{nomeMes}</p>
            {closed ? (
              <p className="mt-1 text-lg font-bold" style={{ color: 'var(--ink)' }}>
                ✓ Mês fechado
                <span className="ml-2 text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>
                  acertado em {fmtDate(closing!.closed_at)}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-lg font-bold" style={{ color: 'var(--accent)' }}>
                ● Em aberto
              </p>
            )}
          </div>
          {closed ? <ReopenButton mes={mes} /> : <CloseButton mes={mes} disabled={pend > 0 || isFuture} />}
        </div>

        {!closed && pend > 0 && (
          <Link
            href={`/dashboard/pendentes?mes=${mes}`}
            className="mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors hover:opacity-90"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <span className="font-medium">⚠️ {pend} pendência(s) neste mês — revise antes de fechar</span>
            <span className="font-semibold">Revisar →</span>
          </Link>
        )}
        {!closed && pend === 0 && !isFuture && (
          <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            Tudo revisado. Quando vocês acertarem as contas, toque em <b>Fechar mês</b> pra salvar o resumo.
          </p>
        )}
        {isFuture && (
          <p className="mt-3 text-[13px]" style={{ color: 'var(--ink-softer)' }}>
            Mês ainda em andamento — só dá pra fechar quando ele terminar.
          </p>
        )}
      </div>

      {/* Acerto do mês */}
      <div className="mb-5 gd-card">
        <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>Acerto do mês</p>
        {diff === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Contas equilibradas — ninguém deve nada neste mês.</p>
        ) : (
          <p className="text-[15px]" style={{ color: 'var(--ink)' }}>
            <b style={{ color: natOwes ? 'var(--na)' : 'var(--je)' }}>{natOwes ? P1.name : P2.name}</b> deve{' '}
            <b className="gd-mono"><Money cents={diff} /></b> para{' '}
            <b style={{ color: natOwes ? 'var(--je)' : 'var(--na)' }}>{natOwes ? P2.name : P1.name}</b>
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Mini label="total dividido" value={<Money cents={total} />} />
          <Mini label="gastos divididos" value={String(gastos.length)} />
        </div>
      </div>

      {/* Contas fixas do mês */}
      {fixedBills.length > 0 && (
        <div className="mb-5 gd-card">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Contas fixas</p>
              <span className="text-xs font-medium" style={{ color: fixedResolvedCount === fixedBills.length ? 'var(--je)' : 'var(--ink-soft)' }}>
                {closed ? 'no fechamento, ' : ''}{fixedPaidCount} de {fixedBills.length} caíram
                {fixedManualCount > 0 && ` · ${fixedManualCount} resolvida${fixedManualCount > 1 ? 's' : ''}`}
              </span>
            </div>
            <span className="gd-mono text-sm font-semibold" style={{ color: 'var(--ink)' }}><Money cents={fixedPaidTotal} /></span>
          </div>
          <div className="flex flex-col gap-2">
            {/* key pelo NOME, nao pelo indice: `computeFixedBills` joga as
                resolvidas pro fim, entao marcar uma conta paga reordena a lista
                e o React reaproveitava o estado (dialogo aberto / isPending) da
                POSICAO — o "marcar paga" aparecia grudado na conta errada. */}
            {fixedBills.map((b) => {
              const ok = b.paid || b.manual
              const billId = billIdByLabel.get(b.label)
              return (
                <div key={b.label} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[13px]" style={{ color: ok ? 'var(--je)' : 'var(--ink-softer)' }}>{ok ? '✓' : '○'}</span>
                    <span className="truncate text-sm" style={{ color: ok ? 'var(--ink)' : 'var(--ink-2)' }}>{b.emoji} {b.label}</span>
                  </span>
                  {b.paid ? (
                    <span className="gd-mono shrink-0 text-sm font-semibold" style={{ color: 'var(--ink)' }}><Money cents={b.amount} /></span>
                  ) : closed ? (
                    b.manual ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        {b.note && <span className="max-w-[160px] truncate text-[11px]" style={{ color: 'var(--ink-soft)' }} title={b.note}>{b.note}</span>}
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--je-soft)', color: 'var(--je)' }}>resolvida</span>
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>não caiu</span>
                    )
                  ) : billId ? (
                    <ResolveFixedBill billId={billId} mes={mes} resolved={b.manual} note={b.note} />
                  ) : (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>a vencer</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Por categoria — gráfico clicável e editável */}
      <div className="gd-card">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Gastos divididos por categoria</p>
          <span className="text-xs" style={{ color: 'var(--ink-softer)' }}>toque numa fatia pra ver os gastos</span>
        </div>
        <DividedByCategory cats={cats} total={totalSaidas} categories={catList} bills={fixedBillDefs ?? []} />
      </div>

      {/* Gastos do mês — só os divididos (exclui 100% de uma pessoa) */}
      <div className="mt-5">
        <p className="mb-4 text-sm font-semibold" style={{ color: 'var(--ink)' }}>Gastos divididos do mês <span style={{ color: 'var(--ink-softer)' }}>(fora os 100%)</span></p>
        <Suspense fallback={<ListSkeleton rows={6} />}>
          <TransactionList userId={user!.id} mes={mes} cat="" q="" dono="" conta="" contaTipo="" page={page} categories={catList} dividedOnly />
        </Suspense>
      </div>
    </div>
  )
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg)' }}>
      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{label}</div>
      <div className="gd-mono mt-0.5 text-base font-semibold" style={{ color: 'var(--ink)' }}>{value}</div>
    </div>
  )
}
