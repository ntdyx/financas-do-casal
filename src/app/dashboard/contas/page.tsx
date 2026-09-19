import { Suspense } from 'react'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AccountCard } from './_components/account-card'
import { ConnectButton } from './_components/connect-button'
import { FutureInvoices } from './_components/future-invoices'
import { Vencimentos } from './_components/vencimentos'
import { SubTabs, CONFIG_TABS } from '../_components/sub-tabs'

export default async function ContasPage() {
  const user = await getUser()
  const supabase = await createClient()

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [{ data: accounts }, { data: txStats }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, owner, default_split_mine_pct, balance_cents, balance_due_date, last_synced_at, created_at, pluggy_item_id')
      .eq('user_id', user!.id)
      .eq('excluded', false)
      .order('created_at', { ascending: true }),

    supabase
      .from('transactions')
      .select('account_id, amount_cents, description')
      .eq('user_id', user!.id)
      .eq('is_transfer', false)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd),
  ])

  const rows = accounts ?? []
  const txRows = txStats ?? []

  // Agrega stats por account_id
  const statsMap = new Map<string, {
    txCount: number
    monthSpent: number
    monthReceived: number
    pixSpent: number
  }>()
  const PIX_RE = /pix/i
  for (const tx of txRows) {
    const prev = statsMap.get(tx.account_id) ?? { txCount: 0, monthSpent: 0, monthReceived: 0, pixSpent: 0 }
    const isPix = PIX_RE.test(tx.description ?? '')
    statsMap.set(tx.account_id, {
      txCount: prev.txCount + 1,
      monthSpent: tx.amount_cents < 0 ? prev.monthSpent + tx.amount_cents : prev.monthSpent,
      monthReceived: tx.amount_cents > 0 ? prev.monthReceived + tx.amount_cents : prev.monthReceived,
      pixSpent: isPix && tx.amount_cents < 0 ? prev.pixSpent + tx.amount_cents : prev.pixSpent,
    })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SubTabs tabs={CONFIG_TABS} />
      <div className="mb-6 flex items-start justify-between gap-5">
        <div>
          <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>
            Contas
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-2)' }}>
            Gerencie suas contas e cartões conectados.
          </p>
        </div>

        <ConnectButton />
      </div>

      {rows.length === 0 ? (
        <>
          <EmptyState />
          <div className="mt-3">
            <ConnectButton variant="dashed" />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {rows.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                stats={
                  statsMap.get(account.id) ?? {
                    txCount: 0,
                    monthSpent: 0,
                    monthReceived: 0,
                    pixSpent: 0,
                  }
                }
              />
            ))}

            <ConnectButton variant="dashed" />
          </div>

          <Suspense fallback={null}>
            <FutureInvoices
              userId={user!.id}
              creditAccounts={rows
                .filter((a) => a.type === 'credit')
                .map((a) => ({ id: a.id, name: a.name }))}
            />
          </Suspense>
        </>
      )}

      {/* Dia do vencimento de cada conta fixa — o dado que faz o app empurrar o
          pagamento antes da multa, em vez de constatar o atraso depois. */}
      <Suspense fallback={null}>
        <Vencimentos />
      </Suspense>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="gd-empty">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl" style={{ background: 'var(--surface-2)' }}>
        🏦
      </div>
      <h2 className="mb-2 text-base font-semibold" style={{ color: 'var(--ink)' }}>
        Conecte sua primeira conta
      </h2>
      <p className="mx-auto max-w-xs text-sm" style={{ color: 'var(--ink-soft)' }}>
        Ligue seu banco ou cartão e a gente importa as transações sozinho. É só tocar
        em <b>Conectar conta</b> pra começar.
      </p>
    </div>
  )
}
