import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPages, PG_MAX_ROWS } from '@/lib/paginate'
import { Money } from '@/components/money'
import { formatBRL } from '@/lib/format'
import { prettyName } from '@/lib/merchants'
import { effectiveName } from '@/lib/rules'
import { SubTabs, MOVIMENTACOES_TABS } from '../_components/sub-tabs'
import { EntradasFilters } from './_components/filters'
import { CategoryPicker } from '../transacoes/_components/category-picker'
import { SplitPicker } from '../transacoes/_components/split-picker'
import { RowActionsMenu } from '../transacoes/_components/row-actions-menu'
import { UnhideButton } from './_components/unhide-button'

interface Props {
  searchParams: Promise<{ mes?: string; conta?: string; contaTipo?: string; q?: string }>
}

/** Uma entrada da lista — o shape do select abaixo. */
interface Entrada {
  id: string
  description: string | null
  note: string | null
  amount_cents: number
  transaction_date: string
  split_mine_pct: number | null
  is_manual: boolean | null
  fixed_bill_id: string | null
  categories: { id: string; name: string; emoji: string | null; color: string | null } | null
  accounts: { name: string; type: string | null } | null
}

export default async function EntradasPage({ searchParams }: Props) {
  const sp = await searchParams
  const now = new Date()
  const mes = sp.mes ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const conta = sp.conta ?? ''
  const contaTipo = sp.contaTipo ?? ''
  const q = sp.q ?? ''

  const allMonths = mes === 'todos'
  const [year, month] = allMonths ? [0, 0] : mes.split('-').map(Number)
  const start = allMonths ? '' : `${year}-${String(month).padStart(2, '0')}-01`
  const end = allMonths ? '' : new Date(year, month, 0).toISOString().slice(0, 10)

  const user = await getUser()
  const supabase = await createClient()

  const [{ data: accounts }, { data: categories }, { data: bills }] = await Promise.all([
    supabase.from('accounts').select('id, name, type').eq('user_id', user!.id).eq('excluded', false).order('name'),
    supabase.from('categories').select('id, name, emoji, color, user_id').order('name'),
    supabase.from('fixed_bills').select('id, name, emoji, position').eq('user_id', user!.id).order('position').order('name'),
  ])
  const cats = categories ?? []
  const billList = bills ?? []

  let accountIds: string[] | null = null
  if (contaTipo) {
    accountIds = (accounts ?? []).filter((a) => a.type === contaTipo).map((a) => a.id)
  }

  // PAGINA: o filtro tem "Todos os meses", e sem range o PostgREST corta em 1000
  // linhas em silencio — o total no topo vinha menor que o real sem nenhum aviso.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (qb: any) => {
    qb = qb.eq('user_id', user!.id).gt('amount_cents', 0).eq('is_transfer', false)
    if (!allMonths) qb = qb.gte('transaction_date', start).lte('transaction_date', end)
    if (q) qb = qb.ilike('description', `%${q}%`)
    if (conta) qb = qb.eq('account_id', conta)
    if (accountIds) qb = accountIds.length === 0 ? qb.eq('account_id', 'none') : qb.in('account_id', accountIds)
    return qb
  }

  const list = await fetchAllPages<Entrada>((from, to) =>
    applyFilters(
      supabase
        .from('transactions')
        .select('id, description, note, amount_cents, transaction_date, split_mine_pct, is_manual, fixed_bill_id, categories(id, name, emoji, color), accounts(name, type)'),
    )
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  )
  const total = list.reduce((s, t) => s + t.amount_cents, 0)

  // Entradas ESCONDIDAS: marcadas como transferência interna e, por isso,
  // invisíveis em todas as outras telas. Precisa ter um lugar onde apareçam —
  // é assim que o pró-labore da PJ da pessoa 2 sumiu sem ninguém notar (a regra
  // de nome do casal em src/lib/transfers.ts engole entrada com o nome dela).
  let escondidasQ = supabase
    .from('transactions')
    .select('id, description, note, amount_cents, transaction_date, accounts(name)')
    .eq('user_id', user!.id)
    .gt('amount_cents', 0)
    .eq('is_transfer', true)
  if (!allMonths) escondidasQ = escondidasQ.gte('transaction_date', start).lte('transaction_date', end)
  const { data: escondidasRows } = await escondidasQ
    .order('amount_cents', { ascending: false })
    .limit(PG_MAX_ROWS)
  const escondidas = escondidasRows ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <SubTabs tabs={MOVIMENTACOES_TABS} />
      <div className="flex items-start justify-between gap-5">
        <div>
          <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>Entradas</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-2)' }}>
            Tudo que entrou (salário, Pix recebido, etc.) — separado dos gastos.
          </p>
        </div>
        <div
          style={{
            textAlign: 'right',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: '13px 20px',
          }}
        >
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 500 }}>{allMonths ? 'total geral' : 'total no mês'}</div>
          <div className="gd-mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--positive)', marginTop: 2 }}>
            <Money cents={total} />
          </div>
        </div>
      </div>

      <div className="mt-[22px]">
        <EntradasFilters
          accounts={accounts ?? []}
          currentMes={mes}
          currentQ={q}
          currentConta={conta}
          currentContaTipo={contaTipo}
        />
      </div>

      {escondidas.length > 0 && (
        <details className="mt-[14px] rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            ⇄ {escondidas.length} entrada{escondidas.length > 1 ? 's' : ''} escondida{escondidas.length > 1 ? 's' : ''} como transferência
            <span className="ml-1 font-normal" style={{ color: 'var(--ink-soft)' }}>
              · {formatBRL(escondidas.reduce((acc, t) => acc + t.amount_cents, 0))}
            </span>
          </summary>
          <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
            Dinheiro que mudou de lugar entre vocês não é renda — mas se alguma
            dessas é entrada de verdade (pró-labore, salário), use o ⇄ pra trazer
            de volta. O app passa a lembrar e o sync não esconde mais.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {escondidas.map((t) => {
              const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
              const dateLabel = new Date(t.transaction_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <UnhideButton txId={t.id} />
                    <span className="truncate" style={{ color: 'var(--ink-2)' }}>
                      {prettyName(effectiveName(t))}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-softer)' }}>
                      {dateLabel}{acc?.name ? ` · ${acc.name}` : ''}
                    </span>
                  </span>
                  <span className="gd-mono shrink-0" style={{ color: 'var(--ink-soft)' }}>
                    <Money cents={t.amount_cents} />
                  </span>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {list.length === 0 ? (
        <div className="gd-empty mt-[14px]">
          <p>Nenhuma entrada encontrada.</p>
        </div>
      ) : (
        <div className="mt-[14px] flex flex-col gap-2.5">
          {list.map((t) => {
            const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
            const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories
            const dateLabel = new Date(t.transaction_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
            return (
              <div
                key={t.id}
                className="gd-row flex items-center justify-between gap-3 px-[18px] py-[15px]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <CategoryPicker txId={t.id} current={cat ?? null} categories={cats} />
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>
                      {prettyName(effectiveName(t))}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                      {dateLabel}{acc ? ` · ${acc.name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SplitPicker txId={t.id} current={t.split_mine_pct ?? null} />
                  <span
                    className="gd-mono"
                    style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--positive)', whiteSpace: 'nowrap' }}
                  >
                    + <Money cents={t.amount_cents} />
                  </span>
                  <RowActionsMenu
                    txId={t.id}
                    fixedBillId={t.fixed_bill_id ?? null}
                    bills={billList}
                    isTransfer={false}
                    isManual={t.is_manual ?? false}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
