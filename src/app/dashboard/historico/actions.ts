'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/** Desfaz uma ação do histórico: restaura o valor anterior do campo. */
export async function undoActivity(logId: string): Promise<{ ok: boolean; reason?: string }> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()

  const { data: log } = await supabase
    .from('activity_log')
    .select('id, tx_id, field, before_value, undone')
    .eq('id', logId)
    .eq('user_id', user.id)
    .single()

  if (!log) return { ok: false, reason: 'não encontrado' }
  if (log.undone) return { ok: false, reason: 'já desfeito' }

  // Ação em lote da IA: before_value é uma lista de snapshots {id, ...campos}
  if (log.field === 'ai_bulk') {
    const snaps = (log.before_value ?? []) as Array<Record<string, unknown> & { id: string }>
    // Erro de CADA update tem que abortar. Antes o erro era descartado, o log
    // era marcado `undone` e o botão dizia "desfeito ✓" sem nada ter voltado —
    // e, com `undone` já true, nem dava pra tentar de novo. Toda aprovação da
    // fila grava `field: 'ai_bulk'`, então era justamente este caminho.
    for (const snap of snaps) {
      const { id, ...fields } = snap
      const { error } = await supabase.from('transactions').update(fields).eq('id', id).eq('user_id', user.id)
      if (error) return { ok: false, reason: error.message }
    }
    const { error: logErr } = await supabase.from('activity_log').update({ undone: true }).eq('id', log.id).eq('user_id', user.id)
    if (logErr) return { ok: false, reason: logErr.message }
    revalidatePath('/dashboard/historico')
    revalidatePath('/dashboard/transacoes')
    revalidatePath('/dashboard/pendentes')
    revalidatePath('/dashboard')
    return { ok: true }
  }

  if (!log.field || !log.tx_id) return { ok: false, reason: 'essa ação não pode ser desfeita' }

  const { error } = await supabase
    .from('transactions')
    .update({ [log.field]: log.before_value })
    .eq('id', log.tx_id)
    .eq('user_id', user.id)

  if (error) return { ok: false, reason: error.message }

  const { error: logErr } = await supabase.from('activity_log').update({ undone: true }).eq('id', log.id).eq('user_id', user.id)
  if (logErr) return { ok: false, reason: logErr.message }

  revalidatePath('/dashboard/historico')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard')
  return { ok: true }
}
