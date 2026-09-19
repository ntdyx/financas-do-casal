'use client'

import { useSearchParams } from 'next/navigation'

/** Mês exibido no topo — segue o ?mes= selecionado; sem ele, mostra o mês atual. */
export function HeaderMonth({ initial }: { initial: string }) {
  const mes = useSearchParams().get('mes')
  let label = initial
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split('-').map(Number)
    label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }
  return (
    // `capitalize` do Tailwind maiúsculiza TODA palavra, então "setembro de 2026"
    // virava "Setembro De 2026". Só a primeira letra deve subir.
    <div className="hidden text-[12px] first-letter:uppercase sm:block" style={{ color: 'var(--ink-soft)' }}>
      {label}
    </div>
  )
}
