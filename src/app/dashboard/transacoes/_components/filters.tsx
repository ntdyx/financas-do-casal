'use client'

import { P1, P2 } from '@/lib/casal'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { FilterMenu, type FilterOption } from '../../_components/filter-menu'
import { SearchBox } from '../../_components/search-box'

interface Category {
  id: string
  name: string
  emoji: string
}

interface Account {
  id: string
  name: string
  type: string
}

interface Props {
  categories: Category[]
  accounts: Account[]
  currentMes: string
  currentCat: string
  currentQ: string
  currentDono: string
  currentConta: string
  currentContaTipo: string
}

export function Filters({ categories, accounts, currentMes, currentCat, currentQ, currentDono, currentConta, currentContaTipo }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('p')
      router.push(`${pathname}?${next.toString()}`)
    },
    [router, pathname, params],
  )

  // Mês
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const months: FilterOption[] = [{ value: 'todos', label: 'Todos os meses' }]
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    months.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }

  const donoOptions: FilterOption[] = [
    { value: '', label: 'Todos' },
    { value: 'nat', label: P1.name, dot: 'var(--na)' },
    { value: 'jen', label: P2.name, dot: 'var(--je)' },
    { value: 'meio', label: '50 / 50', dot: 'var(--ink-2)' },
  ]

  const catOptions: FilterOption[] = [
    { value: '', label: 'Todas as categorias' },
    ...categories.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })),
  ]

  const contaOptions: FilterOption[] = [
    { value: 'tudo', label: 'Todas as contas' },
    { value: 'tipo:credit', label: 'Cartão de crédito', emoji: '💳' },
    { value: 'tipo:checking', label: 'Pix / Conta', emoji: '⚡' },
    ...accounts.map((a) => ({ value: `conta:${a.id}`, label: a.name, emoji: a.type === 'credit' ? '💳' : '⚡' })),
  ]

  // a conta combina dois params (contaTipo + conta) num só menu
  const contaValue = currentConta ? `conta:${currentConta}` : currentContaTipo ? `tipo:${currentContaTipo}` : 'tudo'
  const onContaSelect = (v: string) => {
    const nextParams = new URLSearchParams(params.toString())
    nextParams.delete('p')
    nextParams.delete('conta')
    nextParams.delete('contaTipo')
    if (v.startsWith('conta:')) nextParams.set('conta', v.slice(6))
    else if (v.startsWith('tipo:')) nextParams.set('contaTipo', v.slice(5))
    router.push(`${pathname}?${nextParams.toString()}`)
  }

  const hasActiveFilters = !!(currentCat || currentDono || currentConta || currentContaTipo || currentQ)

  function clearAll() {
    const next = new URLSearchParams()
    next.set('mes', currentMes) // mês é escopo, não "filtro"; mantém
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <FilterMenu icon="📅" value={currentMes} defaultValue={thisMonth} options={months} onSelect={(v) => push('mes', v)} width={200} />
      <FilterMenu label="Quem" value={currentDono} options={donoOptions} onSelect={(v) => push('dono', v)} width={190} />
      <FilterMenu value={currentCat} options={catOptions} onSelect={(v) => push('cat', v)} width={230} />
      <FilterMenu value={contaValue} options={contaOptions} onSelect={onContaSelect} width={230} />

      <SearchBox current={currentQ} onSearch={(v) => push('q', v)} placeholder="Buscar gasto…" />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors hover:bg-black/[0.04]"
          style={{ color: 'var(--ink-soft)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Limpar
        </button>
      )}
    </div>
  )
}
