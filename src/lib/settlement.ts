/**
 * "Quem deve para quem" entre pessoa 1 e pessoa 2.
 *
 * Regras (definidas pela usuária):
 *  - Só entram gastos REALMENTE divididos (50/50 ou 75/25). 100% de uma pessoa
 *    é gasto pessoal e é ignorado.
 *  - A dívida nasce de QUEM PAGOU vs a parte que cabia a cada uma.
 *  - A conta XP é CONJUNTA: gasto no XP é considerado pago meio a meio (não gera
 *    dívida quando é 50/50). A dívida real vem de gasto dividido pago numa conta
 *    PESSOAL (ex: pessoa 1 paga o jardineiro no Nubank dela → pessoa 2 deve metade).
 *
 * owner da conta: 'me' (pessoa 1) | 'pessoa2' | 'shared' (XP, conjunta).
 * split_mine_pct: 0-100 = parte da pessoa 1.
 */

export interface SettlementRow {
  amount_cents: number
  split_mine_pct: number | null
  owner: string | null // dono da conta onde o gasto caiu
}

export interface Settlement {
  pessoa1: number        // saldo líquido (positivo = a receber)
  pessoa2: number
  pessoa1_share: number  // parte total dos gastos divididos que coube à pessoa 1
  pessoa2_share: number
  pessoa1_paid: number   // quanto a pessoa 1 realmente pagou (dono da conta)
  pessoa2_paid: number
}

/** Gasto realmente dividido (50/50 ou 75/25). 100% ou sem divisão é pessoal. */
export function isDividido(split: number | null | undefined): split is number {
  return split !== null && split !== undefined && split !== 0 && split !== 100
}

export function computeSettlement(rows: SettlementRow[]): Settlement {
  let pessoa1 = 0
  let pessoa2 = 0
  let nShare = 0
  let jShare = 0
  let nPaid = 0
  let jPaid = 0

  for (const r of rows) {
    const amt = Math.abs(r.amount_cents)
    const split = r.split_mine_pct
    // só gastos divididos (ignora 100% e sem divisão)
    if (!isDividido(split)) continue

    const natShare = Math.round((amt * split) / 100)
    const jenShare = amt - natShare

    // quem PAGOU, pelo dono da conta. XP (shared) = pago meio a meio (conjunto).
    let paidNat = 0
    let paidJen = 0
    if (r.owner === 'me') paidNat = amt
    else if (r.owner === 'pessoa2') paidJen = amt
    else { paidNat = Math.round(amt / 2); paidJen = amt - paidNat } // shared / conjunta

    nShare += natShare
    jShare += jenShare
    nPaid += paidNat
    jPaid += paidJen
    pessoa1 += paidNat - natShare
    pessoa2 += paidJen - jenShare
  }

  return { pessoa1, pessoa2, pessoa1_share: nShare, pessoa2_share: jShare, pessoa1_paid: nPaid, pessoa2_paid: jPaid }
}
