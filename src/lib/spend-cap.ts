/**
 * Teto de gasto do mes — tudo que sai (recorrente + rotina), combinado entre as
 * duas e redefinido a cada mes na home.
 *
 * E a UNICA regua do app. O modelo antigo comparava gasto com renda calculada
 * das entradas das contas; nao funcionava, porque parte do que entrava nao era
 * renda (devolucao de capital, resgate, dinheiro em transito) e a renda que
 * sustenta a casa nem sempre passa por aqui. O teto nao precisa adivinhar de
 * onde vem o dinheiro: e o quanto o casal decidiu que pode gastar.
 *
 * O extraordinario (compra unica grande — ver gastos.ts) fica FORA do teto.
 *
 * Cada mes tem UMA linha com `effective_from`: redefinir o teto em setembro nao
 * reescreve a barra de agosto, e corrigir o teto de agosto substitui o valor de
 * agosto em vez de criar um segundo. E, como vale a linha mais recente que ja
 * comecou, quem nao mexer num mes mantem o ultimo teto combinado em vez de
 * ficar sem regua.
 */

export interface SpendCapRow {
  amount_cents: number
  effective_from: string // 'YYYY-MM-DD'
}

/**
 * Teto valendo em `ym` ('YYYY-MM'): a linha mais recente que ja tinha comecado.
 *
 * Em EMPATE de `effective_from` ganha a que vem depois na lista — por isso quem
 * consulta ordena por `created_at`, e a correcao vence o valor digitado errado.
 * O unique de (user_id, effective_from) (migration 20260910100000) ja impede o
 * empate no banco; isto aqui e a rede de baixo, pro caso de dado antigo.
 */
export function capForMonth(rows: SpendCapRow[], ym: string): number | null {
  const inicioDoMes = `${ym}-01`
  let vigente: SpendCapRow | null = null
  for (const r of rows) {
    if (r.effective_from > inicioDoMes) continue // ainda nao valia neste mes
    if (!vigente || r.effective_from >= vigente.effective_from) vigente = r
  }
  return vigente ? vigente.amount_cents : null
}
