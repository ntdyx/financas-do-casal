/**
 * Janela de busca do sync — lógica pura (testável sem Supabase/Pluggy).
 *
 * O `from` da Pluggy filtra pela DATA DA COMPRA, não pela data em que o
 * lançamento apareceu. Cartão de crédito lança com atraso (a compra do dia 19
 * nasce na Pluggy no dia 21; teve Turbi que demorou 39 dias), então uma janela
 * [último sync..hoje] deixa esses lançamentos pra trás — e, como nada re-varre
 * o passado, eles somem pra sempre. Por isso a janela é sempre larga.
 */

/** Quantos dias pra trás toda varredura cobre, independente do último sync. */
export const LOOKBACK_DAYS = 90

/**
 * Início da janela (yyyy-mm-dd): sempre os últimos {@link LOOKBACK_DAYS} dias —
 * e mais que isso se o sync ficou parado por mais tempo (aí cobre o buraco todo).
 */
export function syncFrom(prevSync: string | null | undefined, now: Date = new Date()): string {
  const padrao = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  if (!prevSync) return padrao
  const desdeUltimo = new Date(prevSync).toISOString().slice(0, 10)
  return desdeUltimo < padrao ? desdeUltimo : padrao
}

/**
 * Separa o que é linha nova do que já está no banco. Como a janela agora re-varre
 * 90 dias, o upsert cego sobrescreveria a cada sync o `payer` que foi editado na
 * mão — então em quem já existe a gente só atualiza o que vem do banco (valor,
 * data, descrição, raw) e deixa `payer` intocado.
 */
export function splitNewAndExisting<T extends { pluggy_transaction_id: string; payer?: unknown }>(
  rows: T[],
  existingIds: Set<string>,
): { inserts: T[]; updates: Omit<T, 'payer'>[] } {
  const inserts: T[] = []
  const updates: Omit<T, 'payer'>[] = []

  for (const row of rows) {
    if (existingIds.has(row.pluggy_transaction_id)) {
      const semPayer = { ...row }
      delete semPayer.payer
      updates.push(semPayer)
    } else {
      inserts.push(row)
    }
  }

  return { inserts, updates }
}

/* ─────────── PENDING → POSTED: a Pluggy troca o id do lançamento ───────────
 * Quando um lançamento sai de PENDING pra POSTED, a Pluggy o devolve com um id
 * NOVO e para de reportar o antigo. Como o upsert casa por
 * `pluggy_transaction_id`, o id novo entra como linha nova e o mesmo gasto passa
 * a existir duas vezes — inclusive pagamento de fatura de dezenas de milhares.
 *
 * A regra pra casar os dois é conservadora de propósito:
 *   1. a Pluggy NÃO reporta mais o id antigo (se reportasse, seriam dois
 *      lançamentos distintos que por acaso batem em data/valor/descrição);
 *   2. mesma data, mesmo valor e mesma descrição normalizada;
 *   3. exatamente UM candidato de cada lado — na dúvida, não funde nada.
 */
import { normalizeDesc, parcelaDaDesc } from './rules.ts'

export interface DbTxRef {
  pluggy_transaction_id: string
  transaction_date: string
  amount_cents: number
  description: string | null
  /** Parcela: usados pelo casamento de parcela remarcada (ver sync-parcela.ts). */
  installment_number?: number | null
  total_installments?: number | null
}

export interface PluggyTxRef {
  id: string
  transaction_date: string
  amount_cents: number
  description: string | null
}

// normalizeDesc apaga a parcela ("1/5"), mas aqui ela importa: "Loja 1/3" e
// "Loja 2/3" no mesmo dia e valor são dois lançamentos, não um duplicado.
const chaveTx = (t: { transaction_date: string; amount_cents: number; description: string | null }) =>
  `${t.transaction_date}|${t.amount_cents}|${normalizeDesc(t.description)}|${parcelaDaDesc(t.description)}`

/** Mapa `id antigo (no banco)` → `id novo (na Pluggy)`. Vazio quando em dúvida. */
export function matchReplacedIds(
  pluggyRows: PluggyTxRef[],
  dbRows: DbTxRef[],
): Map<string, string> {
  const idsPluggy = new Set(pluggyRows.map((t) => t.id))
  const idsBanco = new Set(dbRows.map((r) => r.pluggy_transaction_id))

  // órfãs: no banco, mas a Pluggy não reporta mais
  const orfas = new Map<string, DbTxRef[]>()
  for (const r of dbRows) {
    if (idsPluggy.has(r.pluggy_transaction_id)) continue
    const k = chaveTx(r)
    const arr = orfas.get(k)
    if (arr) arr.push(r)
    else orfas.set(k, [r])
  }

  // novas: na Pluggy, mas ainda não no banco
  const novas = new Map<string, PluggyTxRef[]>()
  for (const t of pluggyRows) {
    if (idsBanco.has(t.id)) continue
    const k = chaveTx(t)
    const arr = novas.get(k)
    if (arr) arr.push(t)
    else novas.set(k, [t])
  }

  const mapa = new Map<string, string>()
  for (const [k, lista] of novas) {
    const candidatas = orfas.get(k)
    // só casa 1:1 — com mais de uma de cada lado não dá pra saber qual é qual
    if (lista.length !== 1 || !candidatas || candidatas.length !== 1) continue
    mapa.set(candidatas[0].pluggy_transaction_id, lista[0].id)
  }
  return mapa
}

/* ─────────── A Pluggy às vezes devolve a MESMA linha duas vezes ───────────
 * Acontece com pagamento de fatura: a mesma quitação volta com dois ids, as
 * duas POSTED, mesma data/valor/descrição. Sem colapsar, cada sync insere a
 * segunda cópia e o pagamento aparece dobrado.
 *
 * Só descarta do que vai pro upsert — NUNCA apaga linha do banco. Se as duas
 * cópias já existirem lá (dois pagamentos iguais de verdade), a que sobrou
 * apenas não é atualizada neste sync; nada some.
 */

/** Qual das cópias fica: POSTED > já está no banco > menor id (determinismo). */
function melhorCopia<T extends { pluggy_transaction_id: string; raw?: unknown }>(
  a: T,
  b: T,
  existingIds: Set<string>,
): T {
  const posted = (r: T) => (r.raw as { status?: string } | undefined)?.status === 'POSTED'
  if (posted(a) !== posted(b)) return posted(a) ? a : b
  const noBanco = (r: T) => existingIds.has(r.pluggy_transaction_id)
  if (noBanco(a) !== noBanco(b)) return noBanco(a) ? a : b
  return a.pluggy_transaction_id <= b.pluggy_transaction_id ? a : b
}

export function dedupeIncoming<
  T extends {
    pluggy_transaction_id: string
    transaction_date: string
    amount_cents: number
    description: string | null
    raw?: unknown
  },
>(rows: T[], existingIds: Set<string>): { kept: T[]; dropped: T[] } {
  const porChave = new Map<string, T>()
  const dropped: T[] = []

  for (const r of rows) {
    const k = chaveTx(r)
    const atual = porChave.get(k)
    if (!atual) {
      porChave.set(k, r)
      continue
    }
    const vencedor = melhorCopia(atual, r, existingIds)
    porChave.set(k, vencedor)
    dropped.push(vencedor === atual ? r : atual)
  }

  return { kept: [...porChave.values()], dropped }
}
