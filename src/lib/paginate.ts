/**
 * Leitura acima do teto de linhas do Supabase.
 *
 * TODA resposta do PostgREST é cortada em 1000 linhas (`db.max_rows`), e o
 * `.limit()` não levanta esse teto — ele só consegue abaixá-lo. Ou seja:
 * `.limit(3000)` NÃO pede 3000 linhas, pede 1000 e cala a boca. Um `.limit()`
 * generoso no código lê como "cobre tudo" quando na verdade não cobre, e o
 * truncamento é silencioso: nenhum erro, nenhum aviso, só metade dos dados.
 *
 * Quem precisa de cobertura real usa `fetchAllPages`. Quem se contenta com uma
 * fatia usa `PG_MAX_ROWS` explícito E um `.order()`, pra pelo menos ser sempre
 * a MESMA fatia (as mais recentes) em vez de 1000 linhas quaisquer.
 */

/** Teto de linhas por resposta do PostgREST. Não dá pra pedir mais. */
export const PG_MAX_ROWS = 1000

/**
 * Chama `page(from, to)` em blocos de {@link PG_MAX_ROWS} até a tabela acabar.
 * `page` recebe os índices prontos pro `.range(from, to)` do Supabase.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PG_MAX_ROWS) {
    const { data, error } = await page(from, from + PG_MAX_ROWS - 1)
    if (error) {
      console.error('[paginate] leitura falhou, resultado parcial:', error)
      break
    }
    if (!data?.length) break
    out.push(...data)
    if (data.length < PG_MAX_ROWS) break
  }
  return out
}

/**
 * Como {@link fetchAllPages}, mas diz se conseguiu ler TUDO (`complete`).
 *
 * Existe porque leitura parcial não serve pra toda pergunta. Somar um total
 * parcial dá um número menor — ruim, mas visível. Já decidir "essa loja tem
 * divisão consistente?" sobre uma fatia é pior: a resposta vira `true` por
 * falta de dado e o app grava uma regra que sobrescreve o histórico inteiro.
 * Nesses casos quem chama precisa poder desistir em vez de chutar.
 */
export async function fetchAllPagesStrict<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = []
  for (let from = 0; ; from += PG_MAX_ROWS) {
    const { data, error } = await page(from, from + PG_MAX_ROWS - 1)
    if (error) {
      console.error('[paginate] leitura falhou, resultado parcial:', error)
      return { rows, complete: false }
    }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PG_MAX_ROWS) break
  }
  return { rows, complete: true }
}
