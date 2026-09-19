/**
 * Parcela de cartão que a Pluggy REMARCA pra outra data.
 *
 * O dedupe de `sync-window.ts` casa por data+valor+descrição EXATAS. Isso cobre
 * PENDING→POSTED, mas não cobre o que de fato duplicou 45 lançamentos em 2026: a
 * Pluggy devolveu a mesma parcela com **outra data** (a do ciclo da fatura, dia
 * 1º ou 2, em vez da data da compra) e um id novo. Chave diferente → linha nova
 * → R$ 14.098,05 de gasto que nunca existiu, concentrado em julho e agosto.
 *
 * Parcela tem identidade mais forte que um gasto comum: além de loja e valor, ela
 * diz QUAL parcela é ("3/3"). Duas compras distintas na mesma loja, com o mesmo
 * número de parcelas, o mesmo centavo E o mesmo índice de parcela, dentro de
 * poucas semanas, é coincidência improvável — enquanto a remarcação de data é
 * rotina. Então aqui a data sai da chave e entra como janela de tolerância.
 *
 * A janela é deliberadamente curta. Existe caso real de dois planos iguais da
 * mesma clínica (IDM, parcela 2/5 de R$ 700 em 01/07 e em 15/08): fundir os dois
 * apagaria gasto de verdade. 45 dias de distância tem que passar batido.
 */
import { normalizeDesc } from './rules.ts'

/** Tolerância de dias entre a data no banco e a data remarcada pela Pluggy. */
export const JANELA_PARCELA_DIAS = 40

export interface ParcelaRef {
  transaction_date: string
  amount_cents: number
  description: string | null
  /** Opcional porque o select do sync pode não trazer (linha antiga, outro caminho). */
  installment_number?: number | null
  total_installments?: number | null
}

export interface ParcelaDb extends ParcelaRef { pluggy_transaction_id: string }
export interface ParcelaPluggy extends ParcelaRef { id: string }

/** Chave sem data: loja + valor + qual parcela de quantas. */
function chaveParcela(t: ParcelaRef): string | null {
  const { installment_number: i, total_installments: n } = t
  if (!i || !n || n <= 1) return null // sem parcela não há identidade forte
  return `${normalizeDesc(t.description)}|${t.amount_cents}|${i}/${n}`
}

function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)
  return Math.abs(ms) / 86_400_000
}

/**
 * Mapa `id antigo (no banco)` → `id novo (na Pluggy)` para parcelas remarcadas.
 *
 * Mesma disciplina do `matchReplacedIds`: só considera linha do banco que a
 * Pluggy parou de reportar, exige exatamente UM candidato de cada lado, e devolve
 * vazio na dúvida. Nunca apaga nada — quem chama usa o mapa pra renomear o id, e
 * aí o upsert ATUALIZA a linha existente em vez de inserir outra (preservando
 * categoria, divisão e observação que a pessoa editou à mão).
 */
export function matchParcelaRemarcada(
  pluggyRows: ParcelaPluggy[],
  dbRows: ParcelaDb[],
): Map<string, string> {
  const idsPluggy = new Set(pluggyRows.map((t) => t.id))
  const idsBanco = new Set(dbRows.map((r) => r.pluggy_transaction_id))

  const orfas = new Map<string, ParcelaDb[]>()
  for (const r of dbRows) {
    if (idsPluggy.has(r.pluggy_transaction_id)) continue // ainda reportada: é outra linha
    const k = chaveParcela(r)
    if (!k) continue
    const arr = orfas.get(k)
    if (arr) arr.push(r)
    else orfas.set(k, [r])
  }

  const novas = new Map<string, ParcelaPluggy[]>()
  for (const t of pluggyRows) {
    if (idsBanco.has(t.id)) continue
    const k = chaveParcela(t)
    if (!k) continue
    const arr = novas.get(k)
    if (arr) arr.push(t)
    else novas.set(k, [t])
  }

  const mapa = new Map<string, string>()
  for (const [k, lista] of novas) {
    const candidatas = orfas.get(k)
    if (lista.length !== 1 || !candidatas || candidatas.length !== 1) continue
    if (diasEntre(lista[0].transaction_date, candidatas[0].transaction_date) > JANELA_PARCELA_DIAS) continue
    mapa.set(candidatas[0].pluggy_transaction_id, lista[0].id)
  }
  return mapa
}
