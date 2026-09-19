/**
 * Janela de vigência de uma conta fixa.
 *
 * Módulo próprio, e não dentro de `fixed.ts`, porque `fixed.ts` importa o
 * Supabase e `./rules` — não dá pra carregar em teste unitário. Esta regra é pura
 * e merece teste, então mora sozinha (mesmo padrão de `due.ts` e `gastos.ts`).
 */

/** Os campos de janela de uma linha de `fixed_bills`. */
export interface BillWindow {
  /** Primeiro mês em que a conta é esperada. null = sempre existiu. */
  started_on?: string | null
  /** Último mês em que a conta é esperada. null = ainda ativa. */
  ended_on?: string | null
}

/**
 * A conta fixa é esperada no mês `ym` ('YYYY-MM')?
 *
 * Conta fixa entra e sai da vida do casal — o Turbi (aluguel de carro) saiu quando
 * elas compraram um carro, e no lugar entraram a parcela e o seguro. Encerrar com
 * `ended_on`, em vez de apagar a linha, preserva o histórico: os pagamentos de 2026
 * seguem vinculados à conta, e o mês seguinte para de cobrar algo que não existe.
 *
 * A comparação é por MÊS, não por dia: conta encerrada dia 12 ainda é esperada
 * naquele mês (já houve pagamento nele), e uma que começa dia 20 já conta no mês em
 * que começa. Linha sem os campos (vinda de um select antigo) é tratada como ativa
 * — nunca esconder conta por falta de dado.
 */
export function isBillActiveIn(bill: BillWindow, ym: string): boolean {
  if (bill.started_on && bill.started_on.slice(0, 7) > ym) return false
  if (bill.ended_on && bill.ended_on.slice(0, 7) < ym) return false
  return true
}
