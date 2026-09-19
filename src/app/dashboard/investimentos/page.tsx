import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/paginate'
import { Money } from '@/components/money'
import { SubTabs, MOVIMENTACOES_TABS } from '../_components/sub-tabs'
import { InvestimentosFilters } from './_components/filters'
import { CategoryPicker } from '../transacoes/_components/category-picker'

interface Props {
  searchParams: Promise<{ mes?: string; conta?: string; contaTipo?: string; q?: string; tipo?: string }>
}

/** Um aporte/resgate da lista — o shape do select abaixo. */
interface Investimento {
  id: string
  description: string | null
  amount_cents: number
  transaction_date: string
  categories: { id: string; name: string; emoji: string | null; color: string | null } | null
  accounts: { name: string; type: string | null } | null
}

export default async function InvestimentosPage({ searchParams }: Props) {
  const sp = await searchParams
  const now = new Date()
  const mes = sp.mes ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const conta = sp.conta ?? ''
  const contaTipo = sp.contaTipo ?? ''
  const q = sp.q ?? ''
  const tipo = sp.tipo ?? ''

  const allMonths = mes === 'todos'
  const [year, month] = allMonths ? [0, 0] : mes.split('-').map(Number)
  const start = allMonths ? '' : `${year}-${String(month).padStart(2, '0')}-01`
  const end = allMonths ? '' : new Date(year, month, 0).toISOString().slice(0, 10)

  const user = await getUser()
  const supabase = await createClient()

  // `maybeSingle()` devolve ERRO (nao a primeira linha) se houver duas categorias
  // chamadas "Investimento" — e nada no app impede criar a segunda. O resultado
  // era a pagina dizer "Nenhum investimento encontrado" com R$ 0,00, como se o
  // casal nao tivesse aportado nada. Pega a lista e usa a primeira.
  const [{ data: invCats }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase.from('categories').select('id').eq('name', 'Investimento').order('id'),
    supabase.from('accounts').select('id, name, type').eq('user_id', user!.id).eq('excluded', false).order('name'),
    supabase.from('categories').select('id, name, emoji, color, user_id').order('name'),
  ])
  const cats = categories ?? []
  const cat = (invCats ?? [])[0] ?? null

  let accountIds: string[] | null = null
  if (contaTipo) {
    accountIds = (accounts ?? []).filter((a) => a.type === contaTipo).map((a) => a.id)
  }

  // PAGINA: o filtro tem "Todos os meses", e sem range o PostgREST corta em 1000
  // linhas em silencio — "aplicado"/"resgatado" vinham menores que o real.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (qb: any) => {
    qb = qb.eq('user_id', user!.id).eq('category_id', cat!.id)
    if (!allMonths) qb = qb.gte('transaction_date', start).lte('transaction_date', end)
    if (q) qb = qb.ilike('description', `%${q}%`)
    if (conta) qb = qb.eq('account_id', conta)
    if (accountIds) qb = accountIds.length === 0 ? qb.eq('account_id', 'none') : qb.in('account_id', accountIds)
    if (tipo === 'aporte') qb = qb.lt('amount_cents', 0)
    if (tipo === 'resgate') qb = qb.gt('amount_cents', 0)
    return qb
  }

  const list = cat
    ? await fetchAllPages<Investimento>((from, to) =>
        applyFilters(
          supabase
            .from('transactions')
            .select('id, description, amount_cents, transaction_date, categories(id, name, emoji, color), accounts(name, type)'),
        )
          .order('transaction_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      )
    : []
  const aplicado = list.filter((t) => t.amount_cents < 0).reduce((s, t) => s + Math.abs(t.amount_cents), 0)
  const resgatado = list.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <SubTabs tabs={MOVIMENTACOES_TABS} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>Investimentos</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Aportes não são gasto — é dinheiro que mudou de lugar. Aqui você acompanha o que aplicou e resgatou.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="gd-card !p-4 text-right">
            <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{allMonths ? 'aplicado (geral)' : 'aplicado no mês'}</div>
            <div className="gd-mono mt-1 text-lg font-semibold" style={{ color: 'var(--ink)' }}><Money cents={aplicado} /></div>
          </div>
          {resgatado > 0 && (
            <div className="gd-card !p-4 text-right">
              <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{allMonths ? 'resgatado (geral)' : 'resgatado no mês'}</div>
              <div className="gd-mono mt-1 text-lg font-semibold" style={{ color: 'var(--positive)' }}><Money cents={resgatado} /></div>
            </div>
          )}
        </div>
      </div>

      <InvestimentosFilters
        accounts={accounts ?? []}
        currentMes={mes}
        currentQ={q}
        currentConta={conta}
        currentContaTipo={contaTipo}
        currentTipo={tipo}
      />

      {list.length === 0 ? (
        <div className="gd-empty">
          <p>Nenhum investimento encontrado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((t) => {
            const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
            const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories
            const dateLabel = new Date(t.transaction_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
            const isAporte = t.amount_cents < 0
            return (
              <div key={t.id} className="gd-row flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <CategoryPicker txId={t.id} current={cat ?? null} categories={cats} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>{t.description}</span>
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {dateLabel}{acc ? ` · ${acc.name}` : ''} · {isAporte ? 'aporte' : 'resgate'}
                    </span>
                  </div>
                </div>
                <span
                  className="gd-mono shrink-0 text-sm font-semibold"
                  style={{ color: isAporte ? 'var(--ink-soft)' : 'var(--positive)' }}
                >
                  {isAporte ? '−' : '+'}<Money cents={Math.abs(t.amount_cents)} />
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
