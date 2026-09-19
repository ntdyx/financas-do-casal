import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncItem, syncTransactionsFromList } from '@/lib/sync'
import { getApiKey } from '@/lib/pluggy'
import type { PluggyTransaction } from '@/lib/pluggy'

// Pluggy envia Authorization: Bearer <PLUGGY_WEBHOOK_SECRET>
function verifyAuth(request: Request): boolean {
  const secret = process.env.PLUGGY_WEBHOOK_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { event, itemId, accountId } = body

  // Responde 200 rápido para o Pluggy não marcar como falha (timeout 5s)
  // O processamento mais pesado é feito logo após — em Vercel/serverless o
  // runtime aguarda a Promise antes de encerrar a função.

  const supabase = createAdminClient()

  try {
    switch (event) {
      // Novas transações: usa o link direto que a Pluggy já manda no payload
      case 'transactions/created': {
        const { createdTransactionsLink, transactionsCount } = body

        // Busca a conta interna pelo pluggy_account_id
        const { data: account } = await supabase
          .from('accounts')
          .select('id, user_id')
          .eq('pluggy_account_id', accountId)
          .single()

        if (!account) {
          console.warn('[webhook] account não encontrada:', accountId)
          break
        }

        // Usa o link que a Pluggy já construiu — busca só as txs novas
        if (createdTransactionsLink && transactionsCount > 0) {
          const apiKey = await getApiKey()
          const res = await fetch(createdTransactionsLink, {
            headers: { 'x-api-key': apiKey },
            cache: 'no-store',
          })
          if (res.ok) {
            const data = await res.json()
            const txs: PluggyTransaction[] = data.results ?? []
            await syncTransactionsFromList(
              accountId,
              account.id,
              account.user_id,
              supabase,
              txs,
            )
          }
        }
        break
      }

      // Transações atualizadas (ex: status PENDING → POSTED)
      case 'transactions/updated': {
        const { data: account } = await supabase
          .from('accounts')
          .select('id, user_id')
          .eq('pluggy_account_id', accountId)
          .single()

        if (!account) break

        // Re-sincroniza os últimos 7 dias para capturar mudanças de status
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
        const { getTransactions, toAmountCents } = await import('@/lib/pluggy')
        const txs = await getTransactions(accountId, from)
        await syncTransactionsFromList(
          accountId,
          account.id,
          account.user_id,
          supabase,
          txs,
        )
        break
      }

      // Item atualizado manualmente (re-autenticação, etc.) → sync completo
      case 'item/updated': {
        const { data: account } = await supabase
          .from('accounts')
          .select('user_id')
          .eq('pluggy_item_id', itemId)
          .limit(1)
          .single()

        if (!account) break
        await syncItem(itemId, account.user_id, supabase)
        break
      }

      default:
        // Ignora eventos que não nos interessam
        break
    }
  } catch (err) {
    // Loga mas sempre retorna 200 para o Pluggy não fazer retry desnecessário
    console.error('[webhook] erro no processamento:', err)
  }

  return NextResponse.json({ ok: true })
}
