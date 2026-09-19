// Pareamento do IOF com a compra que o gerou. Função pura, sem Supabase, pra
// poder testar — quem lê e grava no banco é linkIofToPurchase (categorize.ts).

export function isIof(d: string | null | undefined): boolean {
  return /\biof\b/i.test(d ?? '')
}

export type IofTx = {
  id: string
  account_id: string
  transaction_date: string // YYYY-MM-DD
  description: string | null
  category_id: string | null
  split_mine_pct: number | null
  created_at: string
  od?: string | null // raw->>date: horário do lançamento, ordena dentro do dia
  amount_cents?: number
  cur?: string | null // raw->>currencyCode: moeda da compra (USD, EUR… = internacional)
}

// O Nubank costuma lançar o IOF no dia SEGUINTE à compra (às vezes 2–3 dias
// depois, quando cai no fim de semana). Mais que isso já é chute.
export const IOF_MAX_DAYS_AFTER = 3

const DAY_MS = 864e5
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS)

// Alíquota do IOF em compra internacional no cartão (3,5% desde 2025). O valor
// do IOF quase nunca bate exato com a compra (o Nubank junta, arredonda e usa o
// câmbio do dia), então isso só desempata — nunca é condição.
const IOF_RATE = 0.035
const IOF_RATE_TOL = 0.004

// `IOF de "Shopify* 482141325"` → "shopify"; sem aspas → null.
// Compara só a 1ª palavra: o resto (código do pedido, cidade) muda entre o IOF
// e a compra.
export function iofMerchant(d: string | null | undefined): string | null {
  const m = (d ?? '').match(/\biof de "([^"]+)"/i)
  return m ? firstWord(m[1]) : null
}
const firstWord = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/)?.[0] ?? ''

/**
 * Pra cada IOF de compra internacional, acha a compra atrelada (débito não-IOF
 * já categorizado, na MESMA conta) e devolve a divisão que o IOF deve herdar.
 *
 * Janela: do próprio dia até IOF_MAX_DAYS_AFTER antes. Dentro dela:
 *   0. se o IOF diz a loja (`IOF de "Alibaba.Com Singapore"`), a compra com
 *      esse nome — é a única certeza que o banco dá;
 *   1. compra em MOEDA ESTRANGEIRA (cur ≠ BRL) — é ela que gera IOF. Se o IOF
 *      for ~3,5% de alguma, essa ganha; senão, a mais recente antes do IOF;
 *   2. sem compra estrangeira na janela: qualquer compra, a mais recente
 *      antes do IOF;
 *   3. nada antes: compra do mesmo dia lançada DEPOIS (banco inverteu a ordem).
 *
 * `qualifies` diz quais IOFs são de compra (ex.: cartão de crédito ou
 * descrição "internacional") — os outros ficam de fora do pareamento.
 * Só devolve o que muda.
 */
export function pairIofSplits(
  txs: IofTx[],
  qualifies: (t: IofTx) => boolean,
): Array<{ id: string; split_mine_pct: number | null }> {
  const byAccount = new Map<string, IofTx[]>()
  for (const t of txs) {
    let arr = byAccount.get(t.account_id)
    if (!arr) { arr = []; byAccount.set(t.account_id, arr) }
    arr.push(t)
  }

  const isPurchase = (t: IofTx) => !isIof(t.description) && !!t.category_id
  const isForeign = (t: IofTx) => !!t.cur && t.cur !== 'BRL'
  const rateMatches = (iof: IofTx, p: IofTx) =>
    !!iof.amount_cents && !!p.amount_cents &&
    Math.abs(iof.amount_cents / p.amount_cents - IOF_RATE) <= IOF_RATE_TOL
  const updates: Array<{ id: string; split_mine_pct: number | null }> = []

  for (const arr of byAccount.values()) {
    const sorted = [...arr].sort(
      (a, b) =>
        a.transaction_date.localeCompare(b.transaction_date) ||
        String(a.od ?? '').localeCompare(String(b.od ?? '')) ||
        String(a.created_at).localeCompare(String(b.created_at)) ||
        a.id.localeCompare(b.id),
    )
    for (let i = 0; i < sorted.length; i++) {
      const iof = sorted[i]
      if (!isIof(iof.description) || !qualifies(iof)) continue

      // candidatas pra trás: mesmo dia antes do IOF, depois os dias anteriores
      const before: IofTx[] = []
      for (let j = i - 1; j >= 0; j--) {
        if (daysBetween(sorted[j].transaction_date, iof.transaction_date) > IOF_MAX_DAYS_AFTER) break
        if (isPurchase(sorted[j])) before.push(sorted[j])
      }
      // pra frente, só no mesmo dia
      const after: IofTx[] = []
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].transaction_date !== iof.transaction_date) break
        if (isPurchase(sorted[j])) after.push(sorted[j])
      }

      const merchant = iofMerchant(iof.description)
      const byName = merchant
        ? [...before, ...after].find((p) => firstWord(p.description ?? '') === merchant)
        : undefined
      const foreign = [...before, ...after].filter(isForeign)
      const byRate = foreign.find((p) => rateMatches(iof, p))
      const purchase = byName ?? byRate ?? foreign[0] ?? before[0] ?? after[0] ?? null

      if (purchase && purchase.split_mine_pct !== iof.split_mine_pct) {
        updates.push({ id: iof.id, split_mine_pct: purchase.split_mine_pct })
      }
    }
  }
  return updates
}
