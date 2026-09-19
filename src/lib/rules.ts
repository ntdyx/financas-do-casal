/**
 * Casamento de descrições para aprendizado (regras de categoria/divisão/fixo).
 * O banco manda a MESMA loja/pessoa em grafias diferentes (maiúsculas, sufixo
 * "LTDA", CNPJ no começo…). Casar por igualdade exata fazia o aprendizado pegar
 * só uma das variações. Aqui normalizamos antes de comparar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Normaliza uma descrição: minúsculas, sem acentos, sem sufixo de empresa
 * (LTDA/ME/SA…), sem parcela ("5/5"), sem números longos (CNPJ/data) e sem
 * pontuação.
 * Ex.: "Transferência enviada|CARLOS GOMES DA SILVA" e
 *      "Transferência enviada|Carlos Gomes da Silva" → mesma chave;
 *      "SEARA ALIMENTOS LTDA" e "Seara Alimentos" → mesma chave;
 *      "Air Europa 1/5" e "Air Europa 5/5" → mesma chave (a categoria e a
 *      divisão aprendidas numa parcela valem pras outras).
 * Quem precisa distinguir parcelas (dedupe do sync) põe a parcela na chave
 * por conta própria — ver parcelaDaDesc.
 */
export function normalizeDesc(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')       // acentos
    .replace(/\|/g, ' ')                                     // separador do Pluggy
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')             // parcela "3/5"
    .replace(/\b\d{1,2}\s+de\s+\d{1,2}\b/g, ' ')              // parcela "1 DE 10"
    .replace(/\b(ltda|epp|eireli|me|s\/a|sa|cia)\b/g, ' ')   // sufixos de empresa
    .replace(/\d{2,}/g, ' ')                                 // CNPJ/parcela/data
    .replace(/[^a-z0-9 ]/g, ' ')                             // pontuação
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Air Europa 3/5" ou "ALLIANZ SEGU*1 DE 10" → "3/5" / "1/10"; sem parcela → "". */
export function parcelaDaDesc(s: string | null | undefined): string {
  return (s ?? '').match(/\b(\d{1,2})\s*(?:\/|\s+de\s+)(\d{1,2})\b/i)?.slice(1, 3).join('/') ?? ''
}

/**
 * Descrições que o banco manda SEM identificar a contraparte (Pix/pagamento
 * genérico). Só nesses casos a observação do usuário vira o "nome".
 */
const OPAQUE_DESC =
  /^\s*(transfer[êe]ncia\s+(enviada|recebida)(\s+pelo\s+pix)?|pagamento\s+(efetuado|recebido|de\s+pix)|cr[ée]dito\s+em\s+conta|pix)\s*$/i

/** Observações geradas pelo próprio app (não são rótulos do usuário). */
function isAutoNote(note: string): boolean {
  return /\(auto\)\s*$/i.test(note)
}

/**
 * Nome EFETIVO de uma transação, p/ exibição e aprendizado.
 * Quando a descrição é genérica (sem nome) e o usuário escreveu uma observação,
 * a observação vira o nome — assim transações com a mesma observação ("Sabesp",
 * "Euro"…) são entendidas como o MESMO gasto. Quando a descrição já tem nome, a
 * observação continua sendo só observação e o nome vem da descrição.
 */
export function effectiveName(t: { description: string | null; note?: string | null }): string {
  const desc = t.description ?? ''
  const note = (t.note ?? '').trim()
  if (note && !isAutoNote(note) && OPAQUE_DESC.test(desc)) return note
  return desc
}

/**
 * IOF? A divisão do IOF nunca é aprendida por nome — ela SEGUE a compra atrelada
 * (linkIofToPurchase). Sem isso, confirmar um IOF criaria uma regra fixa que
 * forçava TODO IOF pra uma pessoa só, independente de quem era a compra.
 */
export function isIofDesc(s: string | null | undefined): boolean {
  return /\biof\b/i.test(s ?? '')
}

// Marcas conhecidas que aparecem com nomes diferentes (mesmo comerciante).
// A 1ª que casar vence — ponha as mais específicas antes.
const MERCHANT_BRANDS: Array<{ brand: string; keys: string[] }> = [
  { brand: 'uber eats',    keys: ['uber eats', 'ubereats'] },
  { brand: 'ifood',        keys: ['ifood', 'ifd'] },
  { brand: 'mercadolivre', keys: ['mercadolivre', 'mercado livre'] },
  { brand: 'rappi',        keys: ['rappi'] },
  { brand: 'shopee',       keys: ['shopee'] },
  { brand: 'shein',        keys: ['shein'] },
  { brand: 'aliexpress',   keys: ['aliexpress'] },
  // contas recorrentes (mesmo beneficiário em formas/meses diferentes)
  { brand: 'sabesp',       keys: ['sabesp'] },
  // assinaturas (recorrem todo mês, mesma categoria)
  { brand: 'amazon prime', keys: ['amazon prime', 'amazonprime', 'prime video'] },
  { brand: 'netflix',      keys: ['netflix'] },
  { brand: 'spotify',      keys: ['spotify'] },
  { brand: 'disney',       keys: ['disney'] },
  { brand: 'google',       keys: ['google'] },
  { brand: 'apple',        keys: ['apple com', 'apple bill', 'itunes', 'apple subscri'] },
  { brand: 'microsoft',    keys: ['microsoft'] },
]

/**
 * Chave de "parecido" — MAIS AMPLA que normalizeDesc, pra SUGESTÃO de quais
 * aplicar junto. Agrupa o mesmo comerciante mesmo quando o resto muda:
 *   - marcas conhecidas (ifood = ifd, Mercadolivre*A = Mercadolivre*B);
 *   - nomes que mudam só pela parcela (tira os números).
 * Usada só pra LISTAR os parecidos; a aplicação é sempre por ids escolhidos.
 */
export function similarKey(desc: string): string {
  const base = normalizeDesc(desc).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()
  for (const m of MERCHANT_BRANDS) {
    if (m.keys.some((k) => base.includes(k))) return m.brand
  }
  return base
}

/* ─────────────────── Índice de descrições (uma leitura só) ───────────────────
 * O pipeline de sync aplica MUITAS regras (uma linha por aprendizado — hoje já
 * são ~1.000). Antes, cada regra fazia o seu próprio SELECT na tabela inteira e
 * o seu próprio UPDATE: ~1.500 requests e ~163 mil linhas lidas por sync, e a
 * cada webhook da Pluggy. Agora as transações são lidas UMA vez, indexadas por
 * descrição normalizada, e os UPDATEs saem agrupados por patch idêntico.
 *
 * Bônus: o SELECT antigo não tinha `limit` nem `order`, então batia no corte de
 * 1000 linhas do PostgREST — as regras vinham sendo aplicadas a uma fatia
 * arbitrária do histórico. `loadDescIndex` pagina e cobre tudo.
 */

/** Colunas que o casamento por descrição precisa (e só elas). */
export const DESC_COLUMNS =
  'id, description, note, category_id, split_mine_pct, fixed_bill_id, is_fixed, is_transfer'

export interface DescRow {
  id: string
  description: string | null
  note: string | null
  category_id: string | null
  split_mine_pct: number | null
  fixed_bill_id: string | null
  is_fixed: boolean | null
  is_transfer: boolean | null
}

export interface DescIndex {
  /** Todas as linhas, na ordem lida — p/ casamento por ILIKE na descrição crua. */
  rows: DescRow[]
  /** normalizeDesc(effectiveName(row)) → linhas. */
  byKey: Map<string, DescRow[]>
  /** id → linha, p/ cruzar com queries que trazem só ids. */
  byId: Map<string, DescRow>
}

export function buildDescIndex(rows: DescRow[]): DescIndex {
  const byKey = new Map<string, DescRow[]>()
  const byId = new Map<string, DescRow>()
  for (const r of rows) {
    byId.set(r.id, r)
    const k = normalizeDesc(effectiveName(r))
    if (!k) continue
    const arr = byKey.get(k)
    if (arr) arr.push(r)
    else byKey.set(k, [r])
  }
  return { rows, byKey, byId }
}

function isNull(row: DescRow, field: keyof DescRow): boolean {
  return row[field] === null || row[field] === undefined
}

/** Linhas cuja descrição normalizada é igual à de `pattern`. */
export function matchRows(
  index: DescIndex,
  pattern: string,
  onlyNullField?: keyof DescRow,
): DescRow[] {
  const target = normalizeDesc(pattern)
  if (!target) return []
  const rows = index.byKey.get(target) ?? []
  return onlyNullField ? rows.filter((r) => isNull(r, onlyNullField)) : rows
}

/** Traduz um padrão ILIKE do Postgres (`%`, `_`) pra RegExp — o resto é literal. */
export function ilikeToRegExp(pattern: string): RegExp {
  const body = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.')
  return new RegExp(`^${body}$`, 'i')
}

/** Linhas cuja descrição CRUA casa com o padrão ILIKE (sem normalizar). */
export function matchIlike(
  index: DescIndex,
  pattern: string,
  onlyNullField?: keyof DescRow,
): DescRow[] {
  const re = ilikeToRegExp(pattern)
  return index.rows.filter(
    (r) => re.test(r.description ?? '') && (!onlyNullField || isNull(r, onlyNullField)),
  )
}

/** Linhas tocadas e quais campos foram tocados em cada uma. */
export interface PendingUpdates {
  touched: Map<string, { row: DescRow; fields: Set<string> }>
}

export function newPending(): PendingUpdates {
  return { touched: new Map() }
}

/**
 * Enfileira `patch` para `rows` E aplica no índice em memória. A escrita local é
 * o que preserva a ordem entre regras: antes, o filtro `is null` ia ao banco a
 * cada regra, então a 1ª regra a preencher um campo ganhava das seguintes. Sem
 * mutar aqui, a última regra é que ganharia.
 */
export function stage(
  pending: PendingUpdates,
  rows: DescRow[],
  patch: Record<string, unknown>,
): void {
  if (rows.length === 0) return
  const campos = Object.keys(patch)
  for (const r of rows) {
    Object.assign(r, patch)
    let alvo = pending.touched.get(r.id)
    if (!alvo) {
      alvo = { row: r, fields: new Set() }
      pending.touched.set(r.id, alvo)
    }
    for (const c of campos) alvo.fields.add(c)
  }
}

/**
 * Os UPDATEs a escrever: um por conjunto de valores finais idêntico.
 *
 * O valor sai da LINHA (já mutada por `stage`), não do patch enfileirado — é o
 * que faz a última regra ganhar, como no código antigo, que fazia um UPDATE por
 * regra em ordem. Agrupar pelos patches na ordem em que os grupos nasceram
 * inverteria o desempate quando uma regra posterior reusa um grupo anterior.
 */
export function plannedUpdates(
  pending: PendingUpdates,
): Array<{ patch: Record<string, unknown>; ids: string[] }> {
  const grupos = new Map<string, { patch: Record<string, unknown>; ids: string[] }>()
  for (const { row, fields } of pending.touched.values()) {
    const patch: Record<string, unknown> = {}
    for (const c of [...fields].sort()) patch[c] = (row as unknown as Record<string, unknown>)[c]
    const chave = JSON.stringify(patch)
    let g = grupos.get(chave)
    if (!g) {
      g = { patch, ids: [] }
      grupos.set(chave, g)
    }
    g.ids.push(row.id)
  }
  return [...grupos.values()]
}

const PAGE = 1000

/** Lê TODAS as transações do usuário (paginado) e indexa por descrição. */
export async function loadDescIndex(
  supabase: SupabaseClient,
  userId: string,
): Promise<DescIndex> {
  const rows: DescRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select(DESC_COLUMNS)
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[rules] leitura do índice falhou:', error)
      break
    }
    if (!data?.length) break
    rows.push(...(data as unknown as DescRow[]))
    if (data.length < PAGE) break
  }
  return buildDescIndex(rows)
}

/** Escreve os UPDATEs enfileirados: um por patch distinto (em blocos de ids). */
export async function flushPatches(
  supabase: SupabaseClient,
  userId: string,
  pending: PendingUpdates,
): Promise<void> {
  const CHUNK = 200
  for (const { patch, ids } of plannedUpdates(pending)) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { error } = await supabase
        .from('transactions')
        .update(patch)
        .eq('user_id', userId)
        .in('id', ids.slice(i, i + CHUNK))
      if (error) console.error('[rules] update falhou:', error)
    }
  }
  pending.touched.clear()
}

/**
 * Atualiza todas as transações do usuário cuja descrição NORMALIZADA é igual à
 * de `pattern`. Se `onlyNullField` for passado, só toca nas linhas onde aquele
 * campo está null (pra não sobrescrever edição manual). Retorna nº de linhas.
 *
 * Para UMA regra avulsa (edição na tela). No sync, que aplica milhares delas,
 * use `loadDescIndex` + `matchRows` + `stage` + `flushPatches` — uma leitura só.
 */
export async function updateMatchingByDesc(
  supabase: SupabaseClient,
  userId: string,
  pattern: string,
  patch: Record<string, unknown>,
  onlyNullField?: string,
): Promise<number> {
  const index = await loadDescIndex(supabase, userId)
  const rows = matchRows(index, pattern, onlyNullField as keyof DescRow | undefined)
  if (rows.length === 0) return 0

  const pending = newPending()
  stage(pending, rows, patch)
  await flushPatches(supabase, userId, pending)
  return rows.length
}
