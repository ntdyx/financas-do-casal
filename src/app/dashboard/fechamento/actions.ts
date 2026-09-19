'use server'

import { P1, P2 } from '@/lib/casal'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { computeSettlement, isDividido } from '@/lib/settlement'
import { computeFixedBills } from '@/lib/fixed'
import { logActivity } from '@/lib/activity'
import { prettyName } from '@/lib/merchants'
import { effectiveName } from '@/lib/rules'

function monthRange(mes: string) {
  const [year, month] = mes.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().slice(0, 10)
  return { year, month, start, end }
}

function mesLabel(mes: string) {
  const [year, month] = mes.split('-').map(Number)
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${meses[month - 1]} de ${year}`
}

/** Fecha o mês: confere que não há pendências e salva um snapshot do acerto. */
export async function closeMonth(mes: string): Promise<{ ok?: true; error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado.' }
  const supabase = await createClient()
  const { year, month, start, end } = monthRange(mes)

  // Pendências do mês bloqueiam o fechamento
  const { count: pendentes } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('reviewed', false)
    .eq('is_transfer', false)
    .lt('amount_cents', 0)
    .gte('transaction_date', start)
    .lte('transaction_date', end)

  if ((pendentes ?? 0) > 0) {
    return { error: `Há ${pendentes} pendência(s) neste mês. Revise tudo antes de fechar.` }
  }

  // Recalcula o snapshot no servidor (não confia no cliente)
  const [{ data: txs }, { data: fixedBillDefs }, { data: marks }] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount_cents, split_mine_pct, fixed_bill_id, categories(name, emoji, color), accounts(owner)')
      .eq('user_id', user.id)
      .eq('is_transfer', false)
      .gte('transaction_date', start)
      .lte('transaction_date', end),
    supabase
      .from('fixed_bills')
      .select('id, name, emoji, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('fixed_bill_marks')
      .select('bill_id, note')
      .eq('user_id', user.id)
      .eq('month', mes),
  ])

  const rows = txs ?? []
  // Contas fixas do mês: registra quais das contas definidas caíram (todos os
  // gastos, não só os divididos — conta fixa pode ser 100% de uma pessoa).
  // Resolvidas na mão entram como "manual" pra não reabrir alerta no calendário.
  const fixedBills = computeFixedBills(fixedBillDefs, rows.filter((t) => t.amount_cents < 0), marks ?? [], mes)
  // Fechamento só considera gastos divididos (50/50 ou 75/25). Pessoais ficam de fora.
  const gastos = rows.filter((t) => t.amount_cents < 0 && isDividido(t.split_mine_pct))
  const totalSaidas = gastos.reduce((s, t) => s + Math.abs(t.amount_cents), 0)
  const totalEntradas = rows.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0)

  const settlement = computeSettlement(
    gastos.map((t) => ({
      amount_cents: t.amount_cents,
      split_mine_pct: t.split_mine_pct,
      owner: (Array.isArray(t.accounts) ? t.accounts[0] : t.accounts)?.owner ?? null,
    })),
  )

  const byCat = new Map<string, { name: string; emoji: string; color: string; total: number }>()
  for (const t of gastos) {
    const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
    const key = c?.name ?? 'Sem categoria'
    const prev = byCat.get(key) ?? { name: key, emoji: c?.emoji ?? '📦', color: c?.color ?? '#9ca3af', total: 0 }
    prev.total += Math.abs(t.amount_cents)
    byCat.set(key, prev)
  }

  const snapshot = {
    total_saidas: totalSaidas,
    total_entradas: totalEntradas,
    total_dividido: settlement.pessoa1_share + settlement.pessoa2_share,
    pessoa1_share: settlement.pessoa1_share,
    pessoa2_share: settlement.pessoa2_share,
    diff: Math.abs(settlement.pessoa1),
    devedor: settlement.pessoa1 < 0 ? P1.name : settlement.pessoa1 > 0 ? P2.name : null,
    tx_count: gastos.length,
    by_category: Array.from(byCat.values()).sort((a, b) => b.total - a.total),
    fixed: {
      paid_count: fixedBills.filter((b) => b.paid).length,
      resolved_count: fixedBills.filter((b) => b.paid || b.manual).length,
      total: fixedBills.length,
      paid_total: fixedBills.reduce((s, b) => s + b.amount, 0),
      bills: fixedBills.map((b) => ({ label: b.label, emoji: b.emoji, paid: b.paid, manual: b.manual, note: b.note, amount: b.amount })),
    },
  }

  const { error } = await supabase
    .from('monthly_closings')
    .upsert(
      { user_id: user.id, year, month, snapshot, closed_at: new Date().toISOString() },
      { onConflict: 'user_id,year,month' },
    )

  if (error) return { error: error.message }

  await logActivity(supabase, user.id, {
    action: 'Fechou o mês',
    description: mesLabel(mes),
    field: 'monthly_closing',
    after: snapshot.diff,
  })

  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard')
  return { ok: true }
}

/** Reabre o mês: remove o fechamento (volta a "em aberto"). */
export async function reopenMonth(mes: string): Promise<{ ok?: true; error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado.' }
  const supabase = await createClient()
  const { year, month } = monthRange(mes)

  const { error } = await supabase
    .from('monthly_closings')
    .delete()
    .eq('user_id', user.id)
    .eq('year', year)
    .eq('month', month)

  if (error) return { error: error.message }

  await logActivity(supabase, user.id, {
    action: 'Reabriu o mês',
    description: mesLabel(mes),
    field: 'monthly_closing',
  })

  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard')
  return { ok: true }
}

/* ─────────────── Resolver conta fixa na mão (pagou em outro mês) ─────────────── */

/** Marca uma conta fixa como resolvida num mês (silencia o "não caiu") com uma
 *  nota. Opcionalmente guarda o pagamento linkado só como referência — NÃO mexe
 *  na transação nem nos totais. */
export async function resolveFixedBill(
  billId: string,
  mes: string,
  note: string,
  txId: string | null = null,
): Promise<{ ok?: true; error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado.' }
  const supabase = await createClient()

  const { error } = await supabase.from('fixed_bill_marks').upsert(
    { user_id: user.id, bill_id: billId, month: mes, note: note.trim() || null, tx_id: txId },
    { onConflict: 'user_id,bill_id,month' },
  )
  if (error) return { error: error.message }

  await logActivity(supabase, user.id, {
    action: 'Resolveu conta fixa',
    description: note.trim() ? `${mesLabel(mes)} — ${note.trim()}` : mesLabel(mes),
    field: 'fixed_bill_mark',
  })

  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard')
  return { ok: true }
}

/** Desfaz a resolução: a conta volta a contar como "não caiu" naquele mês. */
export async function unresolveFixedBill(billId: string, mes: string): Promise<{ ok?: true; error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Não autenticado.' }
  const supabase = await createClient()

  const { error } = await supabase
    .from('fixed_bill_marks')
    .delete()
    .eq('user_id', user.id)
    .eq('bill_id', billId)
    .eq('month', mes)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard')
  return { ok: true }
}

export interface CandidatePayment {
  id: string
  name: string
  amount: number
  date: string
}

/** Pagamentos candidatos pra linkar numa resolução: gastos do mês e dos meses
 *  vizinhos (a conta costuma cair perto da virada). Só referência. */
export async function listCandidatePayments(mes: string): Promise<CandidatePayment[]> {
  const user = await getUser()
  if (!user) return []
  const supabase = await createClient()
  const [year, month] = mes.split('-').map(Number)
  const start = new Date(year, month - 2, 1).toISOString().slice(0, 10)     // mês anterior
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10)       // fim do mês seguinte

  const { data } = await supabase
    .from('transactions')
    .select('id, description, note, amount_cents, transaction_date')
    .eq('user_id', user.id)
    .eq('is_transfer', false)
    .lt('amount_cents', 0)
    .gte('transaction_date', start)
    .lte('transaction_date', end)
    .order('transaction_date', { ascending: false })
    .limit(300)

  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: prettyName(effectiveName(t)),
    amount: Math.abs(t.amount_cents as number),
    date: t.transaction_date as string,
  }))
}
