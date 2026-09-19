/**
 * Carrega o estado de "o que tem que ser pago" — UMA vez, pra dois consumidores:
 * o card da home e o cron que manda o e-mail. Os dois chamam esta função com os
 * mesmos argumentos, pra tela e empurrão nunca discordarem no mesmo dia (mesma
 * ideia do cálculo de sobra em /api/cron/ritmo).
 *
 * A regra de data mora em ./due (puro, testado). Aqui é só I/O.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFixedBills, computeExpectedDays, type FixedBillDef, type FixedMark } from './fixed'
import {
  contasAPagar, faturasAPagar, valoresTipicos, precisaPagarAgora,
  type ContaAPagar, type Fatura,
} from './due'
import { fetchAllPages } from './paginate'

/** Hoje no fuso de São Paulo, 'YYYY-MM-DD'. O dia decide tudo aqui. */
export function hojeSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export interface ContasAPagarSnapshot {
  mes: string
  hoje: string
  fechado: boolean
  contas: ContaAPagar[]
  faturas: Fatura[]
  /** Contas + faturas que pedem pagamento hoje (atrasada ou vence hoje). */
  agora: { contas: ContaAPagar[]; faturas: Fatura[] }
  /** O que vence nos próximos 7 dias (ainda dá tempo). */
  semana: { contas: ContaAPagar[]; faturas: Fatura[] }
  /** Quantas contas ainda não têm dia de vencimento cadastrado. */
  semDia: number
  /** Palpite de dia (mediana do histórico) pra quem não cadastrou o dia. */
  diaAprendido: Map<string, number>
}

/**
 * Lê as contas fixas com o dia do vencimento. Se a coluna `due_day` ainda não
 * existe no banco (migration não aplicada), lê sem ela em vez de devolver erro e
 * apagar o card inteiro: sem o dia, o app cai no palpite do histórico — que é
 * exatamente o comportamento anterior.
 */
async function lerContasFixas(supabase: SupabaseClient, userId: string) {
  const q = () => supabase.from('fixed_bills')
    .select('id, name, emoji, position, due_day, started_on, ended_on')
    .eq('user_id', userId).order('position', { ascending: true }).order('name', { ascending: true })

  const res = await q()
  if (!res.error) return res

  console.error('[contas-a-pagar] fixed_bills.due_day indisponivel, seguindo sem o dia:', res.error.message)
  return supabase.from('fixed_bills').select('id, name, emoji, position')
    .eq('user_id', userId).order('position', { ascending: true }).order('name', { ascending: true })
}

export async function carregaContasAPagar(
  supabase: SupabaseClient,
  userId: string,
  opts: { mes?: string; hoje?: string } = {},
): Promise<ContasAPagarSnapshot> {
  const hoje = opts.hoje ?? hojeSaoPaulo()
  const mes = opts.mes ?? hoje.slice(0, 7)
  const [year, month] = mes.split('-').map(Number)
  const start = `${mes}-01`
  const nextStart = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const [billsRes, pagosRes, marksRes, closingRes, accountsRes, historico] = await Promise.all([
    lerContasFixas(supabase, userId),
    // Só o que já aponta pra uma conta fixa: é isso que computeFixedBills olha,
    // e assim a query não corre risco do teto de 1000 linhas do mês.
    supabase.from('transactions').select('fixed_bill_id, amount_cents')
      .eq('user_id', userId).eq('is_transfer', false).not('fixed_bill_id', 'is', null)
      .gte('transaction_date', start).lt('transaction_date', nextStart),
    // Resolvida na mão (pagamento em outro mês / fora das contas). Sem isto o app
    // cobra conta que o casal já marcou como resolvida no Fechamento.
    supabase.from('fixed_bill_marks').select('bill_id, note').eq('user_id', userId).eq('month', mes),
    supabase.from('monthly_closings').select('closed_at')
      .eq('user_id', userId).eq('year', year).eq('month', month).maybeSingle(),
    supabase.from('accounts').select('id, name, balance_due_date, balance_cents')
      .eq('user_id', userId).eq('type', 'credit').eq('excluded', false),
    // Histórico (meses anteriores) pro valor típico e pro dia aprendido.
    // Paginado: hoje são ~80 linhas, mas uma resposta cortada em silêncio viraria
    // "valor típico" errado no e-mail sem ninguém perceber.
    fetchAllPages<{ fixed_bill_id: string | null; amount_cents: number; transaction_date: string }>(
      (from, to) => supabase.from('transactions')
        .select('fixed_bill_id, amount_cents, transaction_date')
        .eq('user_id', userId).not('fixed_bill_id', 'is', null)
        .lt('transaction_date', start).order('id', { ascending: true }).range(from, to)),
  ])

  const tipicos = valoresTipicos(historico)
  const diaAprendido = computeExpectedDays(historico)
  const fechado = !!closingRes.data

  const estado = computeFixedBills(
    (billsRes.data ?? []) as FixedBillDef[],
    pagosRes.data ?? [],
    (marksRes.data ?? []) as FixedMark[],
    mes, // conta encerrada (Turbi) ou que ainda não começou não entra no empurrão
  )

  const contas = contasAPagar(
    estado.map((b) => ({
      id: b.id, label: b.label, emoji: b.emoji,
      // Sem dia cadastrado, cai no dia APRENDIDO (mediana do dia em que ela foi
      // paga) pra não piorar o que já existia — mas marcado como palpite, porque
      // esse dia pode ser justamente o dia atrasado. Conta que não tem nem
      // histórico fica 'sem_dia' e a tela pede o dia.
      dueDay: b.dueDay ?? diaAprendido.get(b.id) ?? null,
      palpite: b.dueDay == null,
      paid: b.paid, manual: b.manual,
      amount: b.amount, typical: tipicos.get(b.id) ?? 0,
    })),
    { mes, hoje, fechado },
  )

  // Fatura do cartão só entra no mês corrente: 'balance_due_date' é o próximo
  // vencimento em aberto, não tem versão histórica.
  const ehMesCorrente = mes === hoje.slice(0, 7)
  const faturas = ehMesCorrente && !fechado
    ? faturasAPagar((accountsRes.data ?? []).map((a) => ({
        id: a.id, name: a.name, dueDate: a.balance_due_date, amount: Math.abs(a.balance_cents ?? 0),
      })), hoje)
    : []

  return {
    mes, hoje, fechado, contas, faturas,
    agora: {
      contas: contas.filter((c) => precisaPagarAgora(c.status)),
      faturas: faturas.filter((f) => precisaPagarAgora(f.status)),
    },
    semana: {
      contas: contas.filter((c) => c.status === 'semana'),
      faturas: faturas.filter((f) => f.status === 'semana'),
    },
    semDia: contas.filter((c) => c.status === 'sem_dia').length,
    diaAprendido,
  }
}
