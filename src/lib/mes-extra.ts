/**
 * Quebra os gastos de um mes nos baldes que a home mostra. O donut ao lado
 * mistura tudo: visualmente o aluguel pesa igual ao iFood, e ai nao da pra ver
 * que so uma parte do total esta na sua mao.
 *
 * A rotina vem separada em tres: casal (gasto dividido, pelo valor CHEIO, igual
 * ao donut), pessoa 1 (100%) e pessoa 2 (0%). Gasto sem divisao nao entra em
 * nenhum: ele volta pra fila de revisao no sync, entao atribuir seria chute.
 *
 * O extraordinario e contado a parte e NAO e dividido por pessoa: ele fica fora
 * do teto do mes (ver gastos.ts), entao rateá-lo entre as tres so daria a
 * impressao de que alguem estourou o proprio espaco por ter comprado um carro.
 */
import { baldeDe, type GastoTx } from './gastos.ts'
import { isDividido } from './settlement.ts'

export interface ExtraTx extends GastoTx {
  split_mine_pct: number | null
}

export interface MesExtra {
  casal: number               // centavos, positivo
  nat: number
  jen: number
  recorrenteRealizado: number // o que JA caiu de recorrente neste mes
  extraordinario: number      // compras unicas grandes — fora do teto
}

export function computeMesExtra(txs: ExtraTx[]): MesExtra {
  const out: MesExtra = { casal: 0, nat: 0, jen: 0, recorrenteRealizado: 0, extraordinario: 0 }
  for (const t of txs) {
    if (t.amount_cents >= 0) continue // entrada nao e gasto
    const v = Math.abs(t.amount_cents)
    const balde = baldeDe(t)
    if (balde === 'recorrente') { out.recorrenteRealizado += v; continue }
    if (balde === 'extraordinario') { out.extraordinario += v; continue }
    if (isDividido(t.split_mine_pct)) out.casal += v
    else if (t.split_mine_pct === 100) out.nat += v
    else if (t.split_mine_pct === 0) out.jen += v
  }
  return out
}

/**
 * Quanto AINDA da pra gastar ate o fim do mes.
 *
 * Diferente da "sobra prevista", que projeta como o mes vai TERMINAR se o ritmo
 * continuar. Este aqui e saldo: o que existe agora, ja descontado o que tem
 * dono. Serve pra decidir se da pra pedir um jantar hoje — a sobra prevista nao
 * serve pra isso.
 *
 * A regua e o TETO combinado no mes, nao a renda: o dinheiro que sustenta a casa
 * nao passa todo pelas contas sincronizadas, entao somar entradas produzia um
 * teto inventado — as vezes o dobro do real, as vezes um decimo.
 *
 * Usa o fixo TIPICO, nao o que ja caiu: o aluguel que vence dia 25 ja tem dono
 * mesmo sem ter saido da conta. Descontar so o que caiu diria que da pra gastar
 * um dinheiro que nao e seu.
 *
 * O extraordinario do mes nao entra: ele nao disputa o teto.
 */
export function disponivelDoMes(p: {
  teto: number
  fixoTipico: number
  trombadoes: number
  extra: MesExtra
}): number {
  const rotinaGasta = p.extra.casal + p.extra.nat + p.extra.jen
  return p.teto - p.fixoTipico - p.trombadoes - rotinaGasta
}
