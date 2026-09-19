/**
 * Aplica splits automáticos a transações.
 * Dois níveis de prioridade:
 *   1. Default da conta (só preenche onde split_mine_pct IS NULL)
 *   2. Regras aprendidas do usuário (sobrepõe tudo, incluindo default da conta)
 *
 * Chamado depois do upsert no sync.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDescIndex, matchRows, stage, newPending, flushPatches, type DescIndex } from './rules'
import { fetchAllPages } from './paginate'
import { splitPeloDono, type Dono, type ParcelaTx } from './parcela-dono'

export async function applySplitRules(
  userId: string,
  supabase: SupabaseClient,
  index?: DescIndex,
): Promise<void> {
  // ── 1. Default da conta ────────────────────────────────────────────────────
  // Para contas com default_split_mine_pct configurado, preenche transações
  // novas (split_mine_pct IS NULL) sem tocar no que o usuário já editou.
  // Continua em SQL: o critério é account_id, não descrição — e são 2 ou 3
  // contas, não milhares de regras. O índice fica com split_mine_pct defasado
  // depois disto, o que é inofensivo porque o passo 2 sobrescreve de qualquer
  // jeito (não usa guard `is null`).
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, default_split_mine_pct')
    .eq('user_id', userId)
    .not('default_split_mine_pct', 'is', null)

  for (const acc of accounts ?? []) {
    await supabase
      .from('transactions')
      .update({ split_mine_pct: acc.default_split_mine_pct })
      .eq('user_id', userId)
      .eq('account_id', acc.id)
      .is('split_mine_pct', null)
  }

  // ── 2. Regras aprendidas ───────────────────────────────────────────────────
  // Aplica a TODAS as transações com a descrição correspondente.
  // null no campo split_mine_pct da regra = usuário explicitamente removeu o split.
  const { data: rules } = await supabase
    .from('split_rules')
    .select('description_pattern, split_mine_pct')
    .eq('user_id', userId)

  if (!rules?.length) return

  const idx = index ?? (await loadDescIndex(supabase, userId))
  const pending = newPending()
  for (const rule of rules) {
    stage(pending, matchRows(idx, rule.description_pattern), { split_mine_pct: rule.split_mine_pct })
  }
  await flushPatches(supabase, userId, pending)
}

/**
 * Parcela 100% de uma pessoa fica com o dono do cartão (ver parcela-dono.ts).
 * Roda DEPOIS de applySplitRules — é a palavra final sobre parcela individual —
 * e ANTES de linkIofToPurchase, pro IOF copiar a divisão já corrigida.
 */
export async function applyInstallmentOwnerSplit(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, owner')
    .eq('user_id', userId)
    .eq('type', 'credit')
    .in('owner', ['me', 'pessoa2'])
  const donoDoCartao = new Map((accounts ?? []).map((a) => [a.id as string, a.owner as Dono]))
  if (!donoDoCartao.size) return

  const txs = await fetchAllPages<ParcelaTx>((from, to) =>
    supabase
      .from('transactions')
      .select('id, account_id, description, split_mine_pct')
      .eq('user_id', userId)
      .in('account_id', [...donoDoCartao.keys()])
      .lt('amount_cents', 0)
      .eq('is_transfer', false)
      .like('description', '%/%')
      .order('id', { ascending: true })
      .range(from, to),
  )

  for (const u of splitPeloDono(txs, donoDoCartao)) {
    await supabase.from('transactions').update({ split_mine_pct: u.split_mine_pct }).eq('id', u.id)
  }
}
