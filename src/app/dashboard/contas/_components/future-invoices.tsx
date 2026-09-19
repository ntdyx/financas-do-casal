import { createClient } from '@/lib/supabase/server'
import { Money } from '@/components/money'

interface Account {
  id: string
  name: string
}

interface Props {
  userId: string
  creditAccounts: Account[]
}

export async function FutureInvoices({ userId, creditAccounts }: Props) {
  if (creditAccounts.length === 0) return null

  const supabase = await createClient()

  // Próximos 4 meses a partir do mês atual
  const now = new Date()
  const months: { label: string; start: string; end: string }[] = []
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    months.push({
      label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: new Date(year, month, 0).toISOString().slice(0, 10),
    })
  }

  const accountIds = creditAccounts.map((a) => a.id)

  // Busca todas as transações dos próximos 4 meses nos cartões
  const { data: txs } = await supabase
    .from('transactions')
    .select('account_id, amount_cents, transaction_date, installment_number, total_installments')
    .eq('user_id', userId)
    .in('account_id', accountIds)
    .gte('transaction_date', months[0].start)
    .lte('transaction_date', months[3].end)

  const rows = txs ?? []

  // Monta mapa: accountId → month_start → { total, installmentTotal, txCount }
  type MonthStats = { total: number; installmentTotal: number; txCount: number }
  const map = new Map<string, Map<string, MonthStats>>()

  for (const acc of creditAccounts) {
    const inner = new Map<string, MonthStats>()
    for (const m of months) inner.set(m.start, { total: 0, installmentTotal: 0, txCount: 0 })
    map.set(acc.id, inner)
  }

  for (const tx of rows) {
    const monthStart = tx.transaction_date.slice(0, 7) + '-01'
    const inner = map.get(tx.account_id)
    if (!inner) continue
    const stats = inner.get(monthStart)
    if (!stats) continue
    const abs = Math.abs(tx.amount_cents)
    const isDebit = tx.amount_cents < 0
    if (isDebit) {
      stats.total += abs
      if (tx.installment_number && tx.total_installments && tx.total_installments > 1) {
        stats.installmentTotal += abs
      }
      stats.txCount++
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--ink-2)' }}>Faturas previstas</h2>

      <div className="flex flex-col gap-6">
        {creditAccounts.map((acc) => {
          const inner = map.get(acc.id)!
          const hasAny = Array.from(inner.values()).some((s) => s.total > 0)

          return (
            <div key={acc.id} className="rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-base">💳</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{acc.name}</span>
              </div>

              {!hasAny ? (
                <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Nenhuma transação futura encontrada.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {months.map((m) => {
                    const stats = inner.get(m.start)!
                    const isCurrentMonth = m.start === months[0].start
                    return (
                      <div
                        key={m.start}
                        className="rounded-xl border px-3 py-3"
                        style={
                          isCurrentMonth
                            ? { background: 'var(--accent-soft)', borderColor: 'transparent' }
                            : { background: 'var(--surface-2)', borderColor: 'transparent' }
                        }
                      >
                        <p className="mb-1.5 text-[11px] font-medium capitalize" style={{ color: 'var(--ink-2)' }}>
                          {m.label}
                          {isCurrentMonth && (
                            <span className="ml-1 rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: 'var(--accent)', color: '#fff' }}>
                              atual
                            </span>
                          )}
                        </p>
                        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                          {stats.total > 0 ? <Money cents={stats.total} /> : <span style={{ color: 'var(--ink-softer)' }}>—</span>}
                        </p>
                        {stats.installmentTotal > 0 && (
                          <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                            <Money cents={stats.installmentTotal} /> em parcelas
                          </p>
                        )}
                        {stats.txCount > 0 && (
                          <p className="mt-0.5 text-[10px]" style={{ color: 'var(--ink-softer)' }}>
                            {stats.txCount} lançamento{stats.txCount > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
