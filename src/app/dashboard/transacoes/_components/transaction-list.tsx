import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Money } from '@/components/money'
import { CategoryPicker } from './category-picker'
import { SplitPicker } from './split-picker'
import { NoteInput } from './note-input'
import { AccountTag } from './account-tag'
import { RowActionsMenu } from './row-actions-menu'
import { ApprovalRow } from './approval-row'
import type { FixedBillRow } from '../actions'
import { similarKey, effectiveName } from '@/lib/rules'
import { prettyName } from '@/lib/merchants'
import { fetchAllPages, PG_MAX_ROWS } from '@/lib/paginate'

const PAGE_SIZE = 30

interface Category {
  id: string
  name: string
  emoji: string
  color: string
}

interface Props {
  userId: string
  mes: string
  cat: string
  q: string
  dono: string
  conta: string
  contaTipo: string
  page: number
  categories: Category[]
  pendingOnly?: boolean
  /** Só gastos realmente divididos (50/50, 75/25…). Exclui 100% de uma pessoa e sem divisão. */
  dividedOnly?: boolean
}

export async function TransactionList({ userId, mes, cat, q, dono, conta, contaTipo, page, categories, pendingOnly = false, dividedOnly = false }: Props) {
  const supabase = await createClient()

  const allMonths = mes === 'todos'
  const [year, month] = allMonths ? [0, 0] : mes.split('-').map(Number)
  const start = allMonths ? '' : `${year}-${String(month).padStart(2, '0')}-01`
  const end = allMonths ? '' : new Date(year, month, 0).toISOString().slice(0, 10)

  let accountIds: string[] | null = null
  if (contaTipo) {
    const { data: accs } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('type', contaTipo)
    accountIds = (accs ?? []).map((a) => a.id)
  }

  // Mesmos filtros na lista (paginada) e no total (todos os gastos do filtro).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (qb: any) => {
    qb = qb.eq('user_id', userId).lt('amount_cents', 0).eq('is_transfer', false)
    // Pendentes: tudo que não foi revisado. O mês é filtro à parte — a fila chama
    // com `mes='todos'` por padrão (nada pode ficar esquecido em mês antigo), mas
    // quando vem de "fechar agosto" ela pede só agosto. Antes o `else if` fazia o
    // `mes` ser ignorado sempre que `pendingOnly`, e não havia como recortar.
    if (pendingOnly) qb = qb.eq('reviewed', false)
    if (!allMonths) qb = qb.gte('transaction_date', start).lte('transaction_date', end)
    if (cat) qb = qb.eq('category_id', cat)
    if (q) qb = qb.ilike('description', `%${q}%`)
    if (dono === 'nat') qb = qb.eq('split_mine_pct', 100)
    if (dono === 'jen') qb = qb.eq('split_mine_pct', 0)
    if (dono === 'meio') qb = qb.eq('split_mine_pct', 50)
    // só divididos: exclui 100% de uma pessoa (100/0) e sem divisão (null)
    if (dividedOnly) qb = qb.not('split_mine_pct', 'is', null).neq('split_mine_pct', 0).neq('split_mine_pct', 100)
    if (conta) qb = qb.eq('account_id', conta)
    if (accountIds) qb = accountIds.length === 0 ? qb.eq('account_id', 'none') : qb.in('account_id', accountIds)
    return qb
  }

  // Só GASTOS (saída): amount < 0 e não é transferência/fatura
  const query = applyFilters(
    supabase
      .from('transactions')
      .select('id, description, amount_cents, transaction_date, installment_number, total_installments, note, split_mine_pct, is_manual, is_transfer, is_fixed, fixed_bill_id, payer, reviewed, categories(id, name, emoji, color), accounts(id, name, type, owner)', {
        count: 'exact',
      }),
  )
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  // Total de TODOS os gastos do filtro (não só os da página atual). Pagina
  // porque o PostgREST corta toda resposta em 1000 linhas e o `.limit(10000)`
  // que estava aqui não levantava esse teto: em "todos os meses" (1.9k gastos)
  // o rodapé vinha somando 1000 linhas quaisquer, ~metade do valor real.
  const totalRowsPromise = fetchAllPages<{ amount_cents: number }>((from, to) =>
    applyFilters(supabase.from('transactions').select('amount_cents'))
      .order('id', { ascending: true })
      .range(from, to),
  )

  // Contas fixas definidas — pro diálogo do "fixo" e pro selinho na linha.
  const billsQuery = supabase
    .from('fixed_bills')
    .select('id, name, emoji, position')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('name', { ascending: true })

  const [{ data, count }, totalRows, { data: billsData }] = await Promise.all([query, totalRowsPromise, billsQuery])
  const bills = billsData ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data ?? []
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)
  const filteredTotal = totalRows.reduce((s, t) => s + Math.abs(t.amount_cents), 0)

  // Pendentes: conta quantos parecidos (mesmo nome normalizado) ainda estão na
  // fila — pra perguntar "replicar pra todos?" ao revisar.
  let similarCounts: Map<string, number> | null = null
  if (pendingOnly) {
    const { data: allPend } = await supabase
      .from('transactions')
      .select('description, note')
      .eq('user_id', userId)
      .eq('reviewed', false)
      .eq('is_transfer', false)
      .lt('amount_cents', 0)
      .limit(PG_MAX_ROWS)
    similarCounts = new Map()
    for (const t of allPend ?? []) {
      const k = similarKey(effectiveName(t))
      similarCounts.set(k, (similarCounts.get(k) ?? 0) + 1)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="gd-empty">
        <p>
          {pendingOnly ? '🎉 Nada pendente! Tudo revisado.' : allMonths ? 'Nenhum gasto encontrado.' : 'Nenhum gasto encontrado neste mês.'}
        </p>
      </div>
    )
  }

  // querystring dos filtros ativos, pra paginação não perder o mês/filtros
  const qs = new URLSearchParams()
  if (mes) qs.set('mes', mes)
  if (cat) qs.set('cat', cat)
  if (q) qs.set('q', q)
  if (dono) qs.set('dono', dono)
  if (conta) qs.set('conta', conta)
  if (contaTipo) qs.set('contaTipo', contaTipo)
  const baseParams = qs.toString()

  const byDate = new Map<string, typeof rows>()
  for (const tx of rows) {
    const key = tx.transaction_date
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(tx)
  }

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          {count} {pendingOnly ? 'pendente' : 'gasto'}{count === 1 ? '' : 's'}
        </span>
        <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Total {pendingOnly ? 'pendente' : allMonths ? 'geral' : 'do mês'}:{' '}
          <span className="gd-mono font-semibold" style={{ color: 'var(--ink)' }}><Money cents={filteredTotal} /></span>
        </span>
      </div>

      <div className="flex flex-col gap-7">
        {Array.from(byDate.entries()).map(([date, txs]) => {
          const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long',
          })
          const dayTotal = txs.reduce((s, t) => s + Math.abs(t.amount_cents), 0)

          return (
            <div key={date}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-medium capitalize" style={{ color: 'var(--ink-soft)' }}>{dateLabel}</span>
                <span className="gd-mono text-xs font-medium" style={{ color: 'var(--ink-soft)' }}><Money cents={dayTotal} /></span>
              </div>

              <div className="flex flex-col gap-2">
                {txs.map((tx) => pendingOnly
                  ? <ApprovalRow key={tx.id} tx={tx} categories={categories} bills={bills} similarCount={(similarCounts?.get(similarKey(effectiveName(tx))) ?? 1) - 1} />
                  : <TxRow key={tx.id} tx={tx} categories={categories} bills={bills} />)}
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} baseParams={baseParams} />}
    </div>
  )
}

function TxRow({ tx, categories, bills }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any
  categories: Category[]
  bills: FixedBillRow[]
}) {
  const cat = Array.isArray(tx.categories) ? tx.categories[0] : tx.categories
  const account = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts
  const bill = bills.find((b) => b.id === tx.fixed_bill_id) ?? null
  // se a observação já virou o NOME (gasto sem nome), não repete embaixo
  const noteIsName = !!(tx.note ?? '').trim() && effectiveName(tx) === (tx.note ?? '').trim()

  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <CategoryPicker txId={tx.id} current={cat ?? null} categories={categories} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>{prettyName(effectiveName(tx))}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {account && (
              <AccountTag
                name={account.name}
                type={account.type as 'credit' | 'checking'}
                owner={(account.owner ?? 'me') as 'me' | 'pessoa2' | 'shared'}
              />
            )}
            {tx.installment_number && tx.total_installments && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--line)', color: 'var(--ink-soft)' }}>
                {tx.installment_number}/{tx.total_installments}
              </span>
            )}
            {bill ? (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                {bill.emoji} {bill.name}
              </span>
            ) : tx.is_fixed && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                📌 Fixo
              </span>
            )}
            <NoteInput txId={tx.id} current={tx.note ?? null} hideValue={noteIsName} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SplitPicker txId={tx.id} current={tx.split_mine_pct ?? null} />
        <span className="gd-mono text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          <Money cents={Math.abs(tx.amount_cents)} />
        </span>
        <RowActionsMenu
          txId={tx.id}
          fixedBillId={tx.fixed_bill_id ?? null}
          bills={bills}
          isTransfer={tx.is_transfer ?? false}
          isManual={tx.is_manual ?? false}
        />
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, baseParams }: { page: number; totalPages: number; baseParams: string }) {
  return (
    <div className="mt-8 flex items-center justify-center gap-3">
      {page > 1 && <PaginationLink page={page - 1} baseParams={baseParams}>← Anterior</PaginationLink>}
      <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{page} / {totalPages}</span>
      {page < totalPages && <PaginationLink page={page + 1} baseParams={baseParams}>Próxima →</PaginationLink>}
    </div>
  )
}

function PaginationLink({ page, baseParams, children }: { page: number; baseParams: string; children: React.ReactNode }) {
  const href = baseParams ? `?${baseParams}&p=${page}` : `?p=${page}`
  return (
    <Link href={href} className="gd-btn text-sm">
      {children}
    </Link>
  )
}
