/** Registra uma ação no histórico do household (com quem fez). */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUser } from './auth'

export interface ActivityEntry {
  action: string
  txId?: string | null
  description?: string | null
  field?: string | null
  before?: unknown
  after?: unknown
}

export async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  entry: ActivityEntry,
): Promise<void> {
  // quem está logado (pessoa 1/pessoa 2) — pra atribuir a ação no Histórico
  let actor: string | null = null
  try {
    actor = (await getUser())?.actor.name ?? null
  } catch {
    /* ignora */
  }

  // fire-and-forget: nunca quebra a ação se a coluna/tabela faltar
  try {
    await supabase.from('activity_log').insert({
      user_id: userId,
      actor,
      action: entry.action,
      tx_id: entry.txId ?? null,
      tx_description: entry.description ?? null,
      field: entry.field ?? null,
      before_value: entry.before ?? null,
      after_value: entry.after ?? null,
    })
  } catch {
    /* ignora */
  }
}
