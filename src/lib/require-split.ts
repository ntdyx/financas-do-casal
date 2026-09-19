/**
 * Invariante do casal: TODO gasto precisa de divisão. Um gasto (saída, não é
 * transferência) sem split_mine_pct volta pra revisão (reviewed=false) pra ela
 * escolher de quem é. Idempotente — seguro no pós-sync e depois de aprovar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function bounceUndividedToReview(userId: string, supabase: SupabaseClient): Promise<void> {
  await supabase
    .from('transactions')
    .update({ reviewed: false, reviewed_at: null })
    .eq('user_id', userId)
    .lt('amount_cents', 0)
    .eq('is_transfer', false)
    .is('split_mine_pct', null)
    .eq('reviewed', true)
}
