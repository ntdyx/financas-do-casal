import { formatBRL } from '@/lib/format'

/**
 * Valor monetário que respeita o "modo privado" (olhinho no header).
 * Quando ativo, o CSS `html[data-privacy="on"] .gd-amount` borra o número.
 */
export function Money({ cents }: { cents: number }) {
  return <span className="gd-amount">{formatBRL(cents)}</span>
}
