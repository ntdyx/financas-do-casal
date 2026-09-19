'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { updateMatchingByDesc } from '@/lib/rules'

async function auth() {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  return { user, supabase }
}

/**
 * Edita um aprendizado e aplica a todos os gastos com o mesmo nome:
 * - CATEGORIA (consistente por loja). categoryId null = apaga a regra de
 *   categoria, sem mexer na categoria dos gastos.
 * - FIXO (gasto recorrente). fixed liga/desliga a regra e marca/desmarca os
 *   gastos com esse nome.
 * - DIVISÃO (split). 'keep' = sem regra (cada gasto fica com a sua divisão).
 *   Um número/null cria a regra e aplica a divisão a todos os gastos do lugar.
 *   Atenção: sobrepõe a divisão individual de cada gasto.
 * - NÃO É UM GASTO (transfer). true cria a regra e marca os iguais como
 *   transferência (⇄); false apaga a regra e volta os iguais a serem gasto.
 */
export async function editRule(
  pattern: string,
  data: { categoryId?: string | null; fixed?: boolean; split?: number | null | 'keep'; transfer?: boolean },
) {
  const { user, supabase } = await auth()
  const now = new Date().toISOString()

  if (data.categoryId !== undefined) {
    if (data.categoryId) {
      await supabase.from('category_rules').upsert(
        { user_id: user.id, description_pattern: pattern, category_id: data.categoryId, updated_at: now },
        { onConflict: 'user_id,description_pattern' })
      await updateMatchingByDesc(supabase, user.id, pattern, { category_id: data.categoryId })
    } else {
      await supabase.from('category_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern)
    }
  }

  if (data.fixed !== undefined) {
    if (data.fixed) {
      await supabase.from('fixed_rules').upsert(
        { user_id: user.id, description_pattern: pattern, created_at: now },
        { onConflict: 'user_id,description_pattern' })
    } else {
      await supabase.from('fixed_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern)
    }
    await updateMatchingByDesc(supabase, user.id, pattern, { is_fixed: data.fixed })
  }

  if (data.split !== undefined) {
    if (data.split === 'keep') {
      // Remove a regra de divisão; não toca nos gastos (cada um fica com a sua).
      await supabase.from('split_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern)
    } else {
      await supabase.from('split_rules').upsert(
        { user_id: user.id, description_pattern: pattern, split_mine_pct: data.split, updated_at: now },
        { onConflict: 'user_id,description_pattern' })
      await updateMatchingByDesc(supabase, user.id, pattern, { split_mine_pct: data.split })
    }
  }

  if (data.transfer !== undefined) {
    if (data.transfer) {
      await supabase.from('transfer_rules').upsert(
        { user_id: user.id, description_pattern: pattern },
        { onConflict: 'user_id,description_pattern' })
    } else {
      await supabase.from('transfer_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern)
    }
    await updateMatchingByDesc(supabase, user.id, pattern, { is_transfer: data.transfer })
  }

  revalidatePath('/dashboard/aprendizados')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/entradas')
  revalidatePath('/dashboard/investimentos')
  revalidatePath('/dashboard')
}

/** Esquece tudo que foi aprendido para uma descrição (categoria + divisão + ⇄). */
export async function forgetRule(pattern: string) {
  const { user, supabase } = await auth()
  await Promise.all([
    supabase.from('category_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern),
    supabase.from('split_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern),
    supabase.from('fixed_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern),
    supabase.from('transfer_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern),
  ])
  revalidatePath('/dashboard/aprendizados')
}

/** Esquece só a categoria aprendida. */
export async function forgetCategoryRule(pattern: string) {
  const { user, supabase } = await auth()
  await supabase.from('category_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern)
  revalidatePath('/dashboard/aprendizados')
}

/** Esquece só a divisão aprendida. */
export async function forgetSplitRule(pattern: string) {
  const { user, supabase } = await auth()
  await supabase.from('split_rules').delete().eq('user_id', user.id).eq('description_pattern', pattern)
  revalidatePath('/dashboard/aprendizados')
}
