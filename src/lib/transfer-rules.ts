/**
 * Aprendizado de "não é um gasto" (⇄). Quando a usuária marca um gasto como
 * transferência/fatura, guardamos a descrição em transfer_rules; aqui o sync
 * re-marca as próximas do mesmo nome como is_transfer=true — igual ao que
 * fixed_rules faz com conta fixa. Só marca onde ainda está como gasto (false);
 * desmarcar um gasto apaga a regra, então nada re-marca sem querer.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDescIndex, matchRows, stage, newPending, flushPatches, type DescIndex } from './rules'

export async function applyTransferRules(
  userId: string,
  supabase: SupabaseClient,
  index?: DescIndex,
): Promise<void> {
  const { data: rules } = await supabase
    .from('transfer_rules')
    .select('description_pattern')
    .eq('user_id', userId)

  if (!rules?.length) return

  const idx = index ?? (await loadDescIndex(supabase, userId))
  const pending = newPending()
  for (const r of rules) {
    stage(pending, matchRows(idx, r.description_pattern), { is_transfer: true })
  }
  await flushPatches(supabase, userId, pending)
}
