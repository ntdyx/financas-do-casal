'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

interface Tab {
  href: string
  label: string
}

/**
 * Barra de abas no topo das páginas agrupadas (Movimentações, Aprendizados,
 * Configurações). Cada aba continua sendo uma rota própria — isto é só a
 * navegação entre elas. Preserva ?mes= ao trocar de aba (as telas por mês).
 */
export function SubTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const mes = params.get('mes')
  const query = mes ? `?mes=${mes}` : ''

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto">
      {tabs.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href + query}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors"
            style={{
              background: active ? 'var(--accent)' : 'var(--surface-2)',
              color: active ? '#fff' : 'var(--ink-2)',
            }}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}

export const MOVIMENTACOES_TABS: Tab[] = [
  { href: '/dashboard/transacoes', label: 'Gastos' },
  { href: '/dashboard/entradas', label: 'Entradas' },
  { href: '/dashboard/investimentos', label: 'Investimentos' },
]

export const APRENDIZADOS_TABS: Tab[] = [
  { href: '/dashboard/aprendizados', label: 'Aprendizados' },
  { href: '/dashboard/historico', label: 'Histórico' },
]

export const CONFIG_TABS: Tab[] = [
  { href: '/dashboard/contas', label: 'Contas' },
  { href: '/dashboard/categorias', label: 'Categorias' },
]
