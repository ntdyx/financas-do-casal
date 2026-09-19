/**
 * Parcela individual segue o DONO DO CARTÃO.
 *
 * Regra do casal: compra parcelada que é 100% de uma pessoa é de quem é o
 * cartão — no cartão da pessoa 1 é dela (split_mine_pct 100), no da pessoa 2 é
 * da pessoa 2 (0). Antes, cada parcela recebia a divisão da parcela de mesmo
 * nome de OUTRA compra (Maislaser 4/10 do cartão da pessoa 1 copiava a 4/10 do
 * cartão da pessoa 2), e o histórico ficou alternando 0/100.
 *
 * Parcela 50/50 (ou qualquer divisão que não seja 0/100) não é tocada.
 * Parcela ainda sem divisão herda o dono do cartão quando as irmãs dela (mesma
 * loja, mesmo cartão) já são todas individuais.
 */
import { normalizeDesc, parcelaDaDesc } from './rules.ts'

export type Dono = 'me' | 'pessoa2'
export const SPLIT_DO_DONO: Record<Dono, number> = { me: 100, pessoa2: 0 }

export interface ParcelaTx {
  id: string
  account_id: string
  description: string | null
  split_mine_pct: number | null
}

const individual = (v: number | null) => v === 0 || v === 100

/** `donoDoCartao`: só os cartões pessoais (owner me/pessoa2). */
export function splitPeloDono(
  txs: ParcelaTx[],
  donoDoCartao: Map<string, Dono>,
): Array<{ id: string; split_mine_pct: number }> {
  const parcelas = txs.filter((t) => donoDoCartao.has(t.account_id) && parcelaDaDesc(t.description))

  const irmas = new Map<string, ParcelaTx[]>()
  const chave = (t: ParcelaTx) => `${t.account_id}|${normalizeDesc(t.description)}`
  for (const t of parcelas) irmas.set(chave(t), [...(irmas.get(chave(t)) ?? []), t])

  const updates: Array<{ id: string; split_mine_pct: number }> = []
  for (const t of parcelas) {
    const alvo = SPLIT_DO_DONO[donoDoCartao.get(t.account_id)!]
    if (t.split_mine_pct === alvo) continue
    if (individual(t.split_mine_pct)) {
      updates.push({ id: t.id, split_mine_pct: alvo })
    } else if (t.split_mine_pct === null) {
      const com = (irmas.get(chave(t)) ?? []).filter((x) => x.split_mine_pct !== null)
      if (com.length && com.every((x) => individual(x.split_mine_pct))) {
        updates.push({ id: t.id, split_mine_pct: alvo })
      }
    }
  }
  return updates
}
