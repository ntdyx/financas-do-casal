/**
 * Os TRES baldes de um gasto. Definicao unica — home, previsao e cron leem daqui.
 *
 * O modelo do app nao olha mais pra renda: o que sustenta a casa nao passa pelas
 * contas sincronizadas, entao somar entradas so produzia um numero inventado. A
 * regua agora e o TETO que o casal define no mes (spend_caps), e a unica coisa
 * que importa e em qual balde cada saida cai:
 *
 *   recorrente     o que se repete todo mes (ver recurring.ts). Piso: ja tem dono
 *                  mesmo antes de cair na conta.
 *   rotina         o gasto do dia a dia. E o unico campo de manobra real.
 *   extraordinario a compra unica grande — o carro, o cambio da viagem, o acerto
 *                  com alguem. Fica FORA do teto: e decisao de patrimonio, nao
 *                  ritmo do mes.
 *
 * Por que o extraordinario sai do teto: em julho/2026 um carro de R$ 104.000
 * fez o "variavel do mes" ir a R$ 155.802, enquanto a rotina de julho foi
 * R$ 41.802 — igual a todo mes. Misturar os dois num numero so nao descreve nem
 * o carro nem o mes, e envenena qualquer media ou mediana tirada depois.
 *
 * Movimentacao (cambio, aporte, transferencia entre voces, pagamento de fatura)
 * nem chega aqui: o sync marca `is_transfer` e todas as telas ja filtram isso.
 *
 * Sem alias `@/` e sem dependencia externa: este arquivo roda no `node --test`.
 */
import { isRecorrente, type RecurringTx } from './recurring.ts'

/**
 * Corte do extraordinario: R$ 3.000 num unico lancamento.
 *
 * Calibrado nos 8 meses de 2026: isola exatamente carro, cambio, Decolar, os
 * Pix grandes da viagem e os acertos com pessoas (Paula, Debora, Mariana, Ada),
 * e nao pega nenhum gasto de rotina — a maior compra rotineira do periodo ficou
 * bem abaixo disso. Acima do corte, um lancamento sozinho ja e um evento.
 */
export const EXTRAORDINARIO_CENTS = 300_000

export interface GastoTx extends RecurringTx {
  amount_cents: number // negativo pra gasto
}

export type Balde = 'recorrente' | 'rotina' | 'extraordinario'

/**
 * Recorrente ganha do corte de valor: o aluguel de R$ 6.578 passa dos R$ 3.000
 * todo mes, e chamar isso de "evento" mensal seria mentira — e piso.
 */
export function baldeDe(t: GastoTx): Balde {
  if (isRecorrente(t)) return 'recorrente'
  return Math.abs(t.amount_cents) >= EXTRAORDINARIO_CENTS ? 'extraordinario' : 'rotina'
}

export interface Baldes {
  recorrente: number
  rotina: number
  extraordinario: number
}

/** Soma (em centavos positivos) por balde. Entradas sao ignoradas. */
export function separaGastos(txs: GastoTx[]): Baldes {
  const out: Baldes = { recorrente: 0, rotina: 0, extraordinario: 0 }
  for (const t of txs) {
    if (t.amount_cents >= 0) continue
    out[baldeDe(t)] += Math.abs(t.amount_cents)
  }
  return out
}

/** O que conta contra o teto do mes: tudo que sai, menos o extraordinario. */
export function contraOTeto(b: Baldes): number {
  return b.recorrente + b.rotina
}
