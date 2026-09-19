'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function deleteAccount(accountId: string) {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()

  // Marca como excluída em vez de deletar — impede que o sync re-crie a conta
  const { error } = await supabase
    .from('accounts')
    .update({ excluded: true })
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/contas')
  revalidatePath('/dashboard')
}

export async function updateAccountSettings(
  accountId: string,
  owner: 'me' | 'pessoa2' | 'shared',
  defaultSplitMinePct: number | null,
) {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()

  const { error } = await supabase
    .from('accounts')
    .update({ owner, default_split_mine_pct: defaultSplitMinePct })
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/contas')
}

/**
 * Dia do vencimento de uma conta fixa. É o dado que faltava pro app empurrar o
 * pagamento ANTES da multa: sem ele, o único "quando" era a mediana do dia em
 * que ela costumava ser paga — que aprende o atraso em vez de corrigi-lo.
 * `null` limpa o dia (volta pro palpite do histórico).
 */
export async function setFixedBillDueDay(billId: string, dueDay: number | null) {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
    throw new Error('Dia do vencimento tem que ser de 1 a 31')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('fixed_bills')
    .update({ due_day: dueDay })
    .eq('id', billId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/contas')
  revalidatePath('/dashboard')
}
