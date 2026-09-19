'use server'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function createPlannedBill(form: FormData): Promise<void> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  const reais = Number(form.get('amount') ?? 0)
  const recurrence = String(form.get('recurrence') ?? 'yearly')
  const { error } = await supabase.from('planned_bills').insert({
    user_id: user.id,
    name: String(form.get('name') ?? '').trim() || 'Conta',
    emoji: String(form.get('emoji') ?? '💸'),
    amount_cents: Math.round(reais * 100),
    recurrence,
    month: Number(form.get('month') ?? 1),
    year: recurrence === 'once' ? Number(form.get('year')) || null : null,
    installments: Math.max(1, Number(form.get('installments') ?? 1)),
    split_mine_pct: form.get('split') ? Number(form.get('split')) : null,
    active: true,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/previsao')
}

export async function deletePlannedBill(id: string): Promise<void> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  const { error } = await supabase.from('planned_bills').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/previsao')
}

export async function togglePlannedBill(id: string, active: boolean): Promise<void> {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  const { error } = await supabase.from('planned_bills').update({ active }).eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/previsao')
}
