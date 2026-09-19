import type { FilterOption } from './filter-menu'

/** Opções do filtro de mês: "Todos os meses" + os últimos 14 meses. */
export function monthOptions(): FilterOption[] {
  const now = new Date()
  const opts: FilterOption[] = [{ value: 'todos', label: 'Todos os meses' }]
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

/** Mês atual no formato YYYY-MM (valor "neutro" do filtro). */
export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
