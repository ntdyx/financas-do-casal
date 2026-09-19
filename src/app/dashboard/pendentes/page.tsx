import { Suspense } from 'react'
import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TransactionList } from '../transacoes/_components/transaction-list'
import { ListSkeleton } from '../_components/skeletons'
import { MarkAllButton } from './_components/mark-all-button'
import { UndoButton } from './_components/undo-button'

interface Props {
  searchParams: Promise<{ p?: string; mes?: string }>
}

export default async function PendentesPage({ searchParams }: Props) {
  const sp = await searchParams
  // `parseInt('abc')` e NaN, e `Math.max(1, NaN)` tambem e NaN: o `.range(NaN, NaN)`
  // dava erro no PostgREST, a lista vinha vazia e a tela anunciava
  // "🎉 Nada pendente! Tudo revisado." — a mentira mais cara que esta tela pode contar.
  const pageRaw = parseInt(sp.p ?? '1', 10)
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1

  // A fila mostra TODOS os meses por padrao (`mes = 'todos'`), que e o certo: nada
  // pode ficar esquecido em mes antigo. Mas na hora de fechar um mes especifico da
  // pra recortar so ele — e o link do Fechamento ja vem com `?mes=`.
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes! : 'todos'

  const user = await getUser()
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, emoji, color, user_id')
    .order('name')

  const cats = categories ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>Pendentes</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Gastos novos pra você revisar. Use o 🤖 em cada um pra ensinar a IA em português (ex: “mercado, divide meio a meio”) — ela aplica e aprende pros próximos.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <UndoButton />
          <MarkAllButton />
        </div>
      </div>

      {mes !== 'todos' && (
        <Link
          href="/dashboard/pendentes"
          className="mb-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <span className="font-medium">Mostrando só {mesLabel(mes)}</span>
          <span className="font-semibold">ver todos os meses →</span>
        </Link>
      )}

      <Suspense fallback={<ListSkeleton rows={8} />}>
        <TransactionList
          userId={user!.id}
          mes={mes}
          cat=""
          q=""
          dono=""
          conta=""
          contaTipo=""
          page={page}
          categories={cats}
          pendingOnly
        />
      </Suspense>
    </div>
  )
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function mesLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MESES[m - 1]} de ${y}`
}
