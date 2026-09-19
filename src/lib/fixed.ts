/**
 * Contas fixas NOMEADAS (Internet, Aluguel, Condomínio…). Cada conta fixa é uma
 * entidade própria (tabela fixed_bills); a transação aponta pra ela via
 * fixed_bill_id. O aprendizado por descrição (fixed_rules.bill_id) só serve pra o
 * sync já marcar as próximas do mesmo lugar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDescIndex, matchRows, stage, newPending, flushPatches, type DescIndex } from './rules'
import { isBillActiveIn } from './fixed-window'

export { isBillActiveIn } from './fixed-window'

/** Aplica as regras aprendidas no sync: marca is_fixed e, quando a regra aponta
 *  pra uma conta fixa, vincula fixed_bill_id (só onde ainda está vazio, pra não
 *  sobrescrever atribuição manual). Regras antigas (sem bill_id) só marcam fixo. */
export async function applyFixedRules(
  userId: string,
  supabase: SupabaseClient,
  index?: DescIndex,
): Promise<void> {
  const { data: rules } = await supabase
    .from('fixed_rules')
    .select('description_pattern, bill_id')
    .eq('user_id', userId)

  if (!rules?.length) return

  const idx = index ?? (await loadDescIndex(supabase, userId))
  const pending = newPending()
  for (const r of rules) {
    if (r.bill_id) {
      stage(pending, matchRows(idx, r.description_pattern, 'fixed_bill_id'), { fixed_bill_id: r.bill_id, is_fixed: true })
    } else {
      stage(pending, matchRows(idx, r.description_pattern), { is_fixed: true })
    }
  }
  await flushPatches(supabase, userId, pending)
}

/* ─────────────────── Contas fixas do mês (home + fechamento) ─────────────────── */

/** Uma conta fixa definida pelo casal (linha da tabela fixed_bills). */
export interface FixedBillDef {
  id: string
  name: string
  emoji: string
  position?: number | null
  /** Dia do vencimento (1-31). null = o casal ainda nao cadastrou. */
  due_day?: number | null
  /** Primeiro mes em que a conta e esperada. null = sempre existiu. */
  started_on?: string | null
  /** Ultimo mes em que a conta e esperada. null = ainda ativa. */
  ended_on?: string | null
}


/** Estado de uma conta fixa NUM mês: caiu ou não, e quanto. */
export interface FixedBill {
  id: string
  label: string
  emoji: string
  paid: boolean       // caiu de verdade (tem transação no mês)
  manual: boolean     // resolvida na mão (pagamento em outro mês / fora das contas)
  note: string | null // explicação da resolução manual
  amount: number
  dueDay: number | null // dia do vencimento cadastrado (null = não sabe)
}

/** Marcação manual de "resolvida" pra uma conta fixa num mês. */
export interface FixedMark {
  bill_id: string
  note: string | null
}

interface GastoRow {
  amount_cents: number
  fixed_bill_id?: string | null
}

/**
 * "Dia esperado" de cada conta fixa, aprendido do histórico: a mediana do dia do
 * mês em que ela caiu nos meses passados. Serve pra saber se uma conta está
 * ATRASADA (já passou o dia habitual e ainda não veio). Contas sem histórico
 * ficam de fora (não dá pra saber o dia). `txs` são pagamentos já vinculados.
 */
export function computeExpectedDays(
  txs: { fixed_bill_id: string | null; transaction_date: string }[],
): Map<string, number> {
  const byBill = new Map<string, number[]>()
  for (const t of txs) {
    if (!t.fixed_bill_id) continue
    const day = Number(t.transaction_date.slice(8, 10))
    if (!day) continue
    const arr = byBill.get(t.fixed_bill_id) ?? []
    arr.push(day)
    byBill.set(t.fixed_bill_id, arr)
  }
  const out = new Map<string, number>()
  for (const [id, days] of byBill) {
    days.sort((a, b) => a - b)
    const mid = Math.floor(days.length / 2)
    out.set(id, days.length % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2))
  }
  return out
}

/**
 * Estado das contas fixas do mês: cada conta DEFINIDA vira uma linha e está
 * "paga" quando existe um gasto do mês apontando pra ela (fixed_bill_id). `gastos`
 * deve conter TODOS os gastos do mês (conta fixa pode ser 100% de uma pessoa).
 */
export function computeFixedBills(
  bills: FixedBillDef[] | null | undefined,
  gastos: GastoRow[],
  marks: FixedMark[] = [],
  /** Mes sendo olhado ('YYYY-MM'). Sem ele, nenhuma conta e filtrada por janela. */
  ym?: string,
): FixedBill[] {
  const markByBill = new Map(marks.map((m) => [m.bill_id, m]))
  return (bills ?? [])
    // conta encerrada (Turbi) ou que ainda nao comecou (parcela do carro) nao
    // entra como "nao caiu" no mes — mas seu historico segue intacto no banco
    .filter((b) => !ym || isBillActiveIn(b, ym))
    .map((b) => {
      const pagos = gastos.filter((t) => t.fixed_bill_id === b.id)
      const paid = pagos.length > 0
      const mark = markByBill.get(b.id)
      return {
        id: b.id,
        label: b.name,
        emoji: b.emoji,
        paid,
        manual: !paid && !!mark,
        note: mark?.note ?? null,
        amount: pagos.reduce((s, t) => s + Math.abs(t.amount_cents), 0),
        dueDay: b.due_day ?? null,
      }
    })
    // resolvidas (pagas ou manuais) vão pro fim; pendentes primeiro; depois nome
    .sort((a, b) => Number(a.paid || a.manual) - Number(b.paid || b.manual) || a.label.localeCompare(b.label))
}
