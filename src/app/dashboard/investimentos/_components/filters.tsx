'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { FilterMenu, type FilterOption } from '../../_components/filter-menu'
import { SearchBox } from '../../_components/search-box'
import { monthOptions, currentMonth } from '../../_components/month-options'

interface Account {
  id: string
  name: string
  type: string
}

interface Props {
  accounts: Account[]
  currentMes: string
  currentQ: string
  currentConta: string
  currentContaTipo: string
  currentTipo: string
}

export function InvestimentosFilters({ accounts, currentMes, currentQ, currentConta, currentContaTipo, currentTipo }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set(key, value)
      else next.delete(key)
      router.push(`${pathname}?${next.toString()}`)
    },
    [router, pathname, params],
  )

  const months = monthOptions()

  const tipoOptions: FilterOption[] = [
    { value: '', label: 'Aportes e resgates' },
    { value: 'aporte', label: 'Só aportes', emoji: '↗' },
    { value: 'resgate', label: 'Só resgates', emoji: '↘' },
  ]

  const contaOptions: FilterOption[] = [
    { value: 'tudo', label: 'Todas as contas' },
    { value: 'tipo:credit', label: 'Cartão de crédito', emoji: '💳' },
    { value: 'tipo:checking', label: 'Pix / Conta', emoji: '⚡' },
    ...accounts.map((a) => ({ value: `conta:${a.id}`, label: a.name, emoji: a.type === 'credit' ? '💳' : '⚡' })),
  ]

  const contaValue = currentConta ? `conta:${currentConta}` : currentContaTipo ? `tipo:${currentContaTipo}` : 'tudo'
  const onContaSelect = (v: string) => {
    const next = new URLSearchParams(params.toString())
    next.delete('conta')
    next.delete('contaTipo')
    if (v.startsWith('conta:')) next.set('conta', v.slice(6))
    else if (v.startsWith('tipo:')) next.set('contaTipo', v.slice(5))
    router.push(`${pathname}?${next.toString()}`)
  }

  const hasActiveFilters = !!(currentTipo || currentConta || currentContaTipo || currentQ)

  function clearAll() {
    const next = new URLSearchParams()
    next.set('mes', currentMes) // mês é escopo, não "filtro"; mantém
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <FilterMenu icon="📅" value={currentMes} defaultValue={currentMonth()} options={months} onSelect={(v) => push('mes', v)} width={200} />
      <FilterMenu value={currentTipo} options={tipoOptions} onSelect={(v) => push('tipo', v)} width={200} />
      <FilterMenu value={contaValue} options={contaOptions} onSelect={onContaSelect} width={230} />

      <SearchBox current={currentQ} onSearch={(v) => push('q', v)} placeholder="Buscar investimento…" />

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
