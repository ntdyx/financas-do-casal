/** Converte centavos para string BRL. Ex: -129900 → "-R$ 1.299,00" */
export function formatBRL(cents: number): string {
  // Um NaN que chegue aqui sai como o literal "R$ NaN" — já aconteceu com
  // snapshot de mês fechado em formato antigo, onde um item sem `amount` envenena
  // o reduce. Melhor um "—" honesto do que um número quebrado no meio do card.
  if (!Number.isFinite(cents)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}
