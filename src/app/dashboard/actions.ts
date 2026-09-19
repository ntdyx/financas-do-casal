'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Define o teto de gasto do mes — tudo que sai (recorrente + rotina), combinado
 * entre as duas. E a UNICA regua do app: nao existe mais calculo de renda,
 * porque o dinheiro que sustenta a casa nao passa todo pelas contas
 * sincronizadas e somar entradas so produzia um teto inventado.
 *
 * Vale JA no mes escolhido, nao no mes que vem: o combinado e mensal, e um teto
 * que so entra em vigor daqui a 30 dias nao serve pra decidir nada hoje.
 *
 * Grava uma LINHA NOVA com `effective_from`, nunca um update — assim redefinir
 * em setembro nao reescreve a barra de agosto. Sem linha nova, o ultimo teto
 * continua valendo: quem nao mexer mantem o combinado do mes passado.
 */
export async function setSpendCap(formData: FormData): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'não autenticado' }

  const reais = Number(String(formData.get('valor') ?? '').replace(',', '.'))
  if (!Number.isFinite(reais) || reais <= 0) return { error: 'valor inválido' }
  const amount_cents = Math.round(reais * 100)

  // O mes que a pessoa esta vendo na tela — o teto que ela define e o daquele
  // mes, nao o de "hoje". Sem isso, mexer no teto olhando agosto salvava em
  // setembro sem nada mudar na tela.
  const mes = String(formData.get('mes') ?? '')
  const now = new Date()
  const alvo = /^\d{4}-\d{2}$/.test(mes)
    ? mes
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const effective_from = `${alvo}-01`

  const supabase = await createClient()
  // UPSERT, nao insert: corrigir o teto do mesmo mes tem que SUBSTITUIR o valor
  // anterior. Com insert ficavam duas linhas com o mesmo `effective_from` e o
  // desempate era a ordem que o Postgres devolvesse — a home podia seguir
  // mostrando o valor digitado errado. O unique de (user_id, effective_from)
  // vem na migration 20260910100000.
  const { error } = await supabase
    .from('spend_caps')
    .upsert({ user_id: user.id, amount_cents, effective_from }, { onConflict: 'user_id,effective_from' })
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return {}
}
