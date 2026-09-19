/**
 * Definicao UNICA de "recorrente" — o que se repete todo mes.
 *
 * Antes existiam duas regras diferentes no repo: a previsao olhava so
 * `is_fixed || fixed_bill_id` e o relatorio olhava `is_fixed || categoria de
 * assinatura`. Uma Netflix sem `is_fixed` era recorrente numa tela e extra na
 * outra — mesmo gasto, duas respostas. Aqui e a UNIAO das duas: quem entra em
 * qualquer uma das regras e recorrente, e as duas telas importam daqui.
 *
 * Sem alias `@/` e sem dependencia externa: este arquivo roda no `node --test`.
 */

/** Categorias cujo gasto e assinatura mensal, mesmo sem `is_fixed` marcado. */
export const SUBSCRIPTION_CATS = new Set([
  'Streaming', 'Ferramentas', 'Fitness', 'Celular', 'Armazenamento',
])

export interface RecurringTx {
  is_fixed?: boolean | null
  fixed_bill_id?: string | null
  categories?: { name: string } | { name: string }[] | null
}

/** O Supabase devolve o join ora como objeto, ora como array de um item. */
export function catNameOf(t: RecurringTx): string {
  const c = Array.isArray(t.categories) ? t.categories[0] : t.categories
  return c?.name ?? 'Sem categoria'
}

export function isRecorrente(t: RecurringTx): boolean {
  if (t.is_fixed === true) return true
  if (t.fixed_bill_id != null) return true
  return SUBSCRIPTION_CATS.has(catNameOf(t))
}
