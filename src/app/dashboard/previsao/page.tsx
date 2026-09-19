import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { buildCorridor } from './_lib/build-corridor'
import { forecastSettlement } from './_lib/forecast-settlement'
import { plannedForMonth } from './_lib/planned'
import { isDividido, type Settlement, type SettlementRow } from '@/lib/settlement'
import { MonthCard } from './_components/month-card'
import { PlannedBillsManager } from './_components/planned-bills-manager'
import { mesesBase, type HistTx } from './_lib/forecast'
import type { SpendCapRow } from '@/lib/spend-cap'
import type { PlannedBill } from './_lib/planned'

const PAGE = 1000

/**
 * O corredor e da CASA, nao de uma pessoa. A regua e o teto mensal, que e um so
 * pras duas — filtrar a previsao por dona compararia a fatia de uma contra o
 * teto de ambas, e a "sobra prevista" viraria um numero sem significado. Por
 * isso o seletor pessoa 1/pessoa 2/Casal saiu daqui.
 */
export default async function PrevisaoPage() {
  const user = await getUser()
  const supabase = await createClient()

  const now = new Date()
  // Janela = os meses que viram baseline. Em janeiro isso volta pro ano
  // anterior; comecar em 1/jan traria zero linha e zeraria tudo.
  const janelaStart = `${mesesBase(now)[0]}-01`
  const hoje = now.toISOString().slice(0, 10)
  const mesStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // Janela do baseline (paginada — cap de 1000 linhas). Sem filtro por dona:
  // o teto e da casa, entao a base tambem tem que ser.
  const histTxs: HistTx[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from('transactions')
      .select('amount_cents, transaction_date, is_fixed, fixed_bill_id, categories(name)')
      .eq('user_id', user!.id).eq('is_transfer', false).lt('amount_cents', 0)
      .gte('transaction_date', janelaStart).lte('transaction_date', hoje)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (!data?.length) break
    histTxs.push(...(data as HistTx[]))
    if (data.length < PAGE) break
  }

  const mesAtualGastos = histTxs.filter((t) => t.transaction_date >= mesStart)

  // Tetos combinados. Nao ha mais leitura de entradas: renda saiu do modelo.
  const { data: capsRaw } = await supabase
    .from('spend_caps').select('amount_cents, effective_from').eq('user_id', user!.id)
    .order('effective_from', { ascending: true }).order('created_at', { ascending: true })
  const caps = (capsRaw ?? []) as SpendCapRow[]

  const { data: plannedRaw } = await supabase.from('planned_bills')
    .select('*').eq('user_id', user!.id)
  const planned = (plannedRaw ?? []) as PlannedBill[]

  // Fechamento previsto ("entre vocês"): reflete os gastos DIVIDIDOS do casal.
  // Mês corrente: divididos realmente lançados até hoje. Meses futuros: só o
  // piso de trombadões divididos (fixas divididas ainda não têm owner/split
  // limpos no schema — ver nota de escopo).
  const mesAtualRows: SettlementRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from('transactions')
      .select('amount_cents, split_mine_pct, accounts(owner)')
      .eq('user_id', user!.id).eq('is_transfer', false).lt('amount_cents', 0)
      .gte('transaction_date', mesStart).lte('transaction_date', hoje)
      .not('split_mine_pct', 'is', null).neq('split_mine_pct', 0).neq('split_mine_pct', 100)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (!data?.length) break
    for (const t of data as { amount_cents: number; split_mine_pct: number | null; accounts: { owner: string | null } | { owner: string | null }[] | null }[]) {
      const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
      mesAtualRows.push({ amount_cents: t.amount_cents, split_mine_pct: t.split_mine_pct, owner: acc?.owner ?? null })
    }
    if (data.length < PAGE) break
  }

  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const settlementByYm: Record<string, Settlement | null> = {}
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const isCurrent = ym === currentYm
    const dividedFloor: SettlementRow[] = isCurrent
      ? []
      : plannedForMonth(planned, ym)
          .filter((h) => isDividido(h.bill.split_mine_pct))
          .map((h) => ({ amount_cents: h.amount_cents, split_mine_pct: h.bill.split_mine_pct, owner: 'shared' }))
    const rows = isCurrent ? mesAtualRows : dividedFloor
    settlementByYm[ym] = rows.length
      ? forecastSettlement({ mesAtualRows: isCurrent ? mesAtualRows : [], dividedFloor: isCurrent ? [] : dividedFloor })
      : null
  }

  const { columns, resumo } = buildCorridor({ now, histTxs, mesAtualGastos, planned, caps, settlementByYm })

  return (
    <div className="space-y-4">
      <h1 className="gd-display text-2xl" style={{ color: 'var(--ink)' }}>Próximos meses</h1>
      {/* faixa-resumo */}
      <p className="text-sm text-[var(--ink-soft)]">
        {resumo.totalTrombadoes > 0
          ? `Próximos 3 meses: trombadões somando R$ ${(resumo.totalTrombadoes / 100).toFixed(0)}.`
          : 'Próximos 3 meses sem trombadões cadastrados.'}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((c) => <MonthCard key={c.ym} col={c} />)}
      </div>
      <PlannedBillsManager bills={planned} />
    </div>
  )
}
