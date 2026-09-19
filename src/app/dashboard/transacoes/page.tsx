import { P1, P2 } from '@/lib/casal'
import { Suspense } from 'react'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Filters } from './_components/filters'
import { TransactionList } from './_components/transaction-list'
import { AddTransactionForm } from './_components/add-transaction-form'
import { ListSkeleton } from '../_components/skeletons'
import { SubTabs, MOVIMENTACOES_TABS } from '../_components/sub-tabs'

interface Props {
  searchParams: Promise<{
    mes?: string
    cat?: string
    q?: string
    p?: string
    dono?: string
    conta?: string
    contaTipo?: string
    div?: string
  }>
}

export default async function TransacoesPage({ searchParams }: Props) {
  const sp = await searchParams

  const now = new Date()
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const mes       = sp.mes       ?? defaultMes
  const cat       = sp.cat       ?? ''
  const q         = sp.q         ?? ''
  const dono      = sp.dono      ?? ''
  const conta     = sp.conta     ?? ''
  const contaTipo = sp.contaTipo ?? ''
  const dividido  = sp.div === '1'
  const pageRaw = parseInt(sp.p ?? '1', 10)
  // Math.max(1, NaN) e NaN: `?p=abc` gerava range(NaN, NaN) e lista vazia.
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1

  const user = await getUser()
  const supabase = await createClient()

  const [{ data: categories }, { data: accounts }] = await Promise.all([
    supabase.from('categories').select('id, name, emoji, color, user_id').order('name'),
    supabase.from('accounts').select('id, name, type').eq('user_id', user!.id).eq('excluded', false).order('name'),
  ])

  const cats = categories ?? []
  const accs = accounts ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <SubTabs tabs={MOVIMENTACOES_TABS} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>Gastos</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Categorize e divida cada gasto entre {P1.name} e {P2.name}
          </p>
        </div>
        <AddTransactionForm categories={cats} />
      </div>

      <Filters
        categories={cats}
        accounts={accs}
        currentMes={mes}
        currentCat={cat}
        currentQ={q}
        currentDono={dono}
        currentConta={conta}
        currentContaTipo={contaTipo}
      />

      <Suspense fallback={<ListSkeleton rows={8} />}>
        <TransactionList
          userId={user!.id}
          mes={mes}
          cat={cat}
          q={q}
          dono={dono}
          conta={conta}
          contaTipo={contaTipo}
          page={page}
          categories={cats}
          dividedOnly={dividido}
        />
      </Suspense>
    </div>
  )
}
