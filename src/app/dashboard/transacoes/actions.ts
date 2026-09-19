'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { applyCategoryRules, markInvestmentsAsTransfer, linkIofToPurchase } from '@/lib/categorize'
import { applySplitRules, applyInstallmentOwnerSplit } from '@/lib/splits'
import { logActivity } from '@/lib/activity'
import { updateMatchingByDesc, normalizeDesc, similarKey, effectiveName, isIofDesc } from '@/lib/rules'
import { bounceUndividedToReview } from '@/lib/require-split'
import { PG_MAX_ROWS, fetchAllPagesStrict } from '@/lib/paginate'

function revalidateHistorico() {
  revalidatePath('/dashboard/historico')
}

async function getAuthenticatedSupabase() {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  return { user, supabase }
}

/**
 * Muda a categoria de um gasto e JÁ APRENDE: cria/atualiza a regra por nome e
 * aplica a TODOS os gastos com o mesmo nome (a categoria de um estabelecimento é
 * estável — Mercado Livre é sempre "compras online", independentemente de quem
 * pagou). Vale em qualquer tela; a troca aparece em Aprendizados. Antes isto só
 * mexia neste gasto e só aprendia ao confirmar (✓ Revisar) — agora aprende
 * sempre, como a usuária pediu.
 */
export async function updateTransactionCategory(
  txId: string,
  categoryId: string | null,
) {
  const { user, supabase } = await getAuthenticatedSupabase()

  const { data: tx } = await supabase
    .from('transactions')
    .select('description, note, category_id')
    .eq('id', txId)
    .eq('user_id', user.id)
    .single()

  if (!tx) throw new Error('Transação não encontrada')

  const name = effectiveName(tx)

  await logActivity(supabase, user.id, {
    action: 'Categoria', txId, description: tx.description,
    field: 'category_id', before: tx.category_id, after: categoryId,
  })

  if (categoryId) {
    // IOF não aprende categoria: todo IOF é da categoria "IOF" (linkIofToPurchase).
    // Sem isso, cada "IOF de <loja>" virava uma regra fixa apontando pra
    // categoria da compra — era o que espalhava o imposto por toda a base.
    if (!isIofDesc(name)) {
      await supabase.from('category_rules').upsert(
        { user_id: user.id, description_pattern: name, category_id: categoryId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,description_pattern' })
      await updateMatchingByDesc(supabase, user.id, name, { category_id: categoryId })
    }
  } else {
    // "Sem categoria": esquece a regra desse nome e limpa os iguais
    await supabase.from('category_rules').delete().eq('user_id', user.id).eq('description_pattern', name)
    await updateMatchingByDesc(supabase, user.id, name, { category_id: null })
  }

  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard/entradas')
  revalidatePath('/dashboard/investimentos')
  revalidatePath('/dashboard/aprendizados')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

/** Alias histórico — trocar categoria já aprende em qualquer lugar. */
export async function learnTransactionCategory(txId: string, categoryId: string | null) {
  return updateTransactionCategory(txId, categoryId)
}

export async function markReviewed(txId: string) {
  const { user, supabase } = await getAuthenticatedSupabase()

  // Ao confirmar, o app APRENDE: categoria, divisão e fixo viram regra pra essa
  // descrição E são aplicados a todos os gastos com o mesmo nome.
  const { data: tx } = await supabase
    .from('transactions')
    .select('description, note, category_id, split_mine_pct, is_fixed, fixed_bill_id, amount_cents, is_transfer')
    .eq('id', txId)
    .eq('user_id', user.id)
    .single()

  // Todo gasto precisa de divisão pra ser revisado.
  if (tx && tx.amount_cents < 0 && !tx.is_transfer && tx.split_mine_pct === null) {
    throw new Error('Escolha a divisão antes de revisar este gasto.')
  }

  // nome efetivo: usa a observação como nome quando a descrição é genérica
  const name = tx ? effectiveName(tx) : ''

  // IOF não aprende categoria (é sempre "IOF") nem divisão (segue a compra).
  if (tx?.category_id && !isIofDesc(name)) {
    await supabase.from('category_rules').upsert(
      { user_id: user.id, description_pattern: name, category_id: tx.category_id },
      { onConflict: 'user_id,description_pattern' })
    await updateMatchingByDesc(supabase, user.id, name, { category_id: tx.category_id })
  }
  // IOF não aprende divisão: ela segue a compra atrelada (linkIofToPurchase).
  if (tx && tx.split_mine_pct !== null && !isIofDesc(name)) {
    await supabase.from('split_rules').upsert(
      { user_id: user.id, description_pattern: name, split_mine_pct: tx.split_mine_pct },
      { onConflict: 'user_id,description_pattern' })
    await updateMatchingByDesc(supabase, user.id, name, { split_mine_pct: tx.split_mine_pct })
    // o nome junta as parcelas dos dois cartões; parcela individual volta pro dono
    await applyInstallmentOwnerSplit(user.id, supabase)
  }
  if (tx?.fixed_bill_id) {
    await supabase.from('fixed_rules').upsert(
      { user_id: user.id, description_pattern: name, bill_id: tx.fixed_bill_id },
      { onConflict: 'user_id,description_pattern' })
    await updateMatchingByDesc(supabase, user.id, name, { fixed_bill_id: tx.fixed_bill_id, is_fixed: true }, 'fixed_bill_id')
  }

  await logActivity(supabase, user.id, {
    action: 'Revisão', txId, description: tx?.description,
    field: 'reviewed', before: false, after: true,
  })

  const { error } = await supabase
    .from('transactions')
    .update({ reviewed: true, reviewed_at: new Date().toISOString() })
    .eq('id', txId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/aprendizados')
  revalidateHistorico()
}

/**
 * Aprova um gasto pendente: salva tudo do rascunho de uma vez (categoria,
 * divisão, fixo, não-gasto, observação), APRENDE (regras + aplica a todos com o
 * mesmo nome) e marca como revisado. Chamado pelo botão "Revisado".
 */
export interface SimilarTx {
  id: string
  amount_cents: number
  transaction_date: string
  split_mine_pct: number | null
  accountName: string
  owner: 'me' | 'pessoa2' | 'shared' | null
  accountType: 'credit' | 'checking'
}

/** Lista os gastos PENDENTES com o mesmo nome (normalizado), exceto o atual. */
export async function getSimilarPending(txId: string): Promise<SimilarTx[]> {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { data: tx } = await supabase
    .from('transactions').select('description, note').eq('id', txId).eq('user_id', user.id).single()
  if (!tx) return []
  const target = similarKey(effectiveName(tx))

  const { data: all } = await supabase
    .from('transactions')
    .select('id, description, note, amount_cents, transaction_date, split_mine_pct, accounts(name, owner, type)')
    .eq('user_id', user.id)
    .eq('reviewed', false)
    .eq('is_transfer', false)
    .lt('amount_cents', 0)
    // Fila de pendentes: dezenas de linhas. 1000 é o teto real do PostgREST.
    .limit(PG_MAX_ROWS)

  return (all ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((t: any) => t.id !== txId && similarKey(effectiveName(t)) === target)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((t: any) => {
      const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
      return {
        id: t.id, amount_cents: t.amount_cents, transaction_date: t.transaction_date,
        split_mine_pct: t.split_mine_pct, accountName: acc?.name ?? '', owner: acc?.owner ?? null,
        accountType: acc?.type ?? 'credit',
      }
    })
}

export async function approveTransaction(
  txId: string,
  data: { categoryId: string | null; split: number | null; fixedBillId: string | null; naoGasto: boolean; note: string; applyToIds?: string[] },
) {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { data: tx } = await supabase
    .from('transactions').select('description, amount_cents').eq('id', txId).eq('user_id', user.id).single()
  if (!tx) throw new Error('Transação não encontrada')
  // Todo gasto precisa de divisão pra ser revisado (a não ser que seja "não é um gasto").
  if (tx.amount_cents < 0 && !data.naoGasto && data.split === null) {
    throw new Error('Escolha a divisão antes de revisar este gasto.')
  }
  const desc = tx.description
  // nome efetivo: a observação que ela escreveu AGORA (rascunho) vira o nome
  // quando a descrição é genérica — é por ele que o aprendizado agrupa.
  const name = effectiveName({ description: desc, note: data.note })
  const now = new Date().toISOString()

  const extraIds = (data.applyToIds ?? []).filter((id) => id !== txId)
  const allIds = [txId, ...extraIds]

  // snapshot ANTES de qualquer alteração (atual + selecionados) — pra desfazer
  const { data: snapRows } = await supabase
    .from('transactions')
    .select('id, description, note, category_id, split_mine_pct, is_fixed, fixed_bill_id, is_transfer, reviewed, reviewed_at')
    .in('id', allIds)
    .eq('user_id', user.id)
  const bulkBefore = (snapRows ?? []).map((t) => ({
    id: t.id, category_id: t.category_id, split_mine_pct: t.split_mine_pct,
    is_fixed: t.is_fixed, fixed_bill_id: t.fixed_bill_id, is_transfer: t.is_transfer, reviewed: t.reviewed, reviewed_at: t.reviewed_at,
  }))

  // 1) a transação atual: aplica tudo do rascunho (incl. não-gasto/observação)
  //    Erro aqui ABORTA: sem isso o gasto continuava pendente e o histórico
  //    registrava "Revisado" — a tela dizia que salvou e não salvou.
  const { error: mainErr } = await supabase.from('transactions').update({
    category_id: data.categoryId,
    split_mine_pct: data.split,
    is_fixed: !!data.fixedBillId,
    fixed_bill_id: data.fixedBillId,
    is_transfer: data.naoGasto,
    note: data.note.trim() || null,
    reviewed: true,
    reviewed_at: now,
  }).eq('id', txId).eq('user_id', user.id)
  if (mainErr) throw new Error(`Não deu pra salvar a revisão: ${mainErr.message}`)

  // 2) aprende CATEGORIA e CONTA FIXA por nome (consistentes). NÃO aprende divisão:
  //    a divisão varia por conta (quem pagou) e segue o padrão da conta.
  if (data.categoryId && !isIofDesc(name)) {
    await supabase.from('category_rules').upsert(
      { user_id: user.id, description_pattern: name, category_id: data.categoryId, updated_at: now }, { onConflict: 'user_id,description_pattern' })
  }
  if (data.fixedBillId) {
    await supabase.from('fixed_rules').upsert(
      { user_id: user.id, description_pattern: name, bill_id: data.fixedBillId }, { onConflict: 'user_id,description_pattern' })
  }

  // 3) aplica aos SELECIONADOS (os parecidos que ela marcou) e tira da fila
  if (extraIds.length > 0) {
    const patch: Record<string, unknown> = { reviewed: true, reviewed_at: now }
    if (data.categoryId) patch.category_id = data.categoryId
    if (data.split !== null) patch.split_mine_pct = data.split
    if (data.fixedBillId) { patch.is_fixed = true; patch.fixed_bill_id = data.fixedBillId }
    if (data.naoGasto) patch.is_transfer = true
    const { error: extraErr } = await supabase.from('transactions').update(patch).in('id', extraIds).eq('user_id', user.id)
    if (extraErr) throw new Error(`Não deu pra aplicar aos parecidos: ${extraErr.message}`)

    // 3b) aprende CATEGORIA e FIXO também pros parecidos: o "aprovar junto"
    //     agrupa nomes diferentes do mesmo comerciante (ifood=ifd, parcelas…).
    //     Sem regra própria, eles sumiam de Aprendizados e voltavam pra fila.
    //     Cria uma regra por nome distinto, com o MESMO timestamp (now) — assim
    //     ficam juntos no topo de Aprendizados, na ordem de aprovação.
    if (data.categoryId || data.fixedBillId) {
      const seen = new Set([normalizeDesc(name)])
      const extraSet = new Set(extraIds)
      for (const row of snapRows ?? []) {
        if (!extraSet.has(row.id)) continue
        const rowName = effectiveName(row)
        const key = normalizeDesc(rowName)
        if (seen.has(key)) continue
        seen.add(key)
        if (data.categoryId && !isIofDesc(rowName)) {
          await supabase.from('category_rules').upsert(
            { user_id: user.id, description_pattern: rowName, category_id: data.categoryId, updated_at: now }, { onConflict: 'user_id,description_pattern' })
        }
        if (data.fixedBillId) {
          await supabase.from('fixed_rules').upsert(
            { user_id: user.id, description_pattern: rowName, bill_id: data.fixedBillId }, { onConflict: 'user_id,description_pattern' })
        }
      }
    }
  }

  // investimento (saída) não é gasto → marca como não-gasto
  await markInvestmentsAsTransfer(user.id, supabase)
  // garante o invariante: nenhum gasto revisado fica sem divisão
  await bounceUndividedToReview(user.id, supabase)

  await logActivity(supabase, user.id, {
    action: extraIds.length > 0 ? `Revisado (${extraIds.length + 1} iguais)` : 'Revisado',
    txId, description: desc, field: 'ai_bulk', before: bulkBefore, after: allIds.length,
  })
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/aprendizados')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

export async function markAllReviewed() {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { error } = await supabase
    .from('transactions')
    .update({ reviewed: true, reviewed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('reviewed', false)
  if (error) throw new Error(error.message)
  // gasto sem divisão não pode ficar revisado → volta pra fila
  await bounceUndividedToReview(user.id, supabase)
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/transacoes')
}

/** Desfazer (ctrl+z): manda a última transação revisada de volta pra pendentes. */
export async function undoLastReview(): Promise<{ undone: boolean }> {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { data: last } = await supabase
    .from('transactions')
    .select('id, description')
    .eq('user_id', user.id)
    .eq('reviewed', true)
    .not('reviewed_at', 'is', null)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!last) return { undone: false }
  await supabase
    .from('transactions')
    .update({ reviewed: false, reviewed_at: null })
    .eq('id', last.id)
    .eq('user_id', user.id)
  await logActivity(supabase, user.id, {
    action: 'Desfez revisão', txId: last.id, description: last.description,
    field: 'reviewed', before: true, after: false,
  })
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/transacoes')
  revalidateHistorico()
  return { undone: true }
}

/* ─────────────────────────── Contas fixas nomeadas ─────────────────────────── */

export interface FixedBillRow {
  id: string
  name: string
  emoji: string
  position: number
}

/** Lista as contas fixas definidas (ordenadas). */
export async function listFixedBills(): Promise<FixedBillRow[]> {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { data } = await supabase
    .from('fixed_bills')
    .select('id, name, emoji, position')
    .eq('user_id', user.id)
    .order('position', { ascending: true })
    .order('name', { ascending: true })
  return data ?? []
}

/** Cria uma conta fixa nova (do diálogo do "fixo" ou do gerenciador). */
export async function createFixedBill(name: string, emoji: string): Promise<FixedBillRow> {
  const { user, supabase } = await getAuthenticatedSupabase()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Nome obrigatório')

  const { data: last } = await supabase
    .from('fixed_bills').select('position').eq('user_id', user.id)
    .order('position', { ascending: false }).limit(1).maybeSingle()
  const position = (last?.position ?? 0) + 1

  const { data, error } = await supabase
    .from('fixed_bills')
    .insert({ user_id: user.id, name: trimmed, emoji: emoji.trim() || '📌', position })
    .select('id, name, emoji, position')
    .single()
  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/contas-fixas')
  revalidatePath('/dashboard')
  return data
}

export async function updateFixedBill(id: string, name: string, emoji: string) {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { error } = await supabase
    .from('fixed_bills')
    .update({ name: name.trim(), emoji: emoji.trim() || '📌' })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/contas-fixas')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard')
}

export async function deleteFixedBill(id: string) {
  const { user, supabase } = await getAuthenticatedSupabase()
  // FK: transactions.fixed_bill_id -> null; fixed_rules dessa conta -> cascade.
  const { error } = await supabase.from('fixed_bills').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/contas-fixas')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard')
}

/**
 * Vincula um gasto a uma conta fixa. APRENDE (descrição → conta) e já marca as
 * outras do mesmo nome que ainda não têm conta — assim os próximos meses caem
 * sozinhos. A troca manual sempre vence pra ESTE gasto.
 */
export async function assignFixedBill(txId: string, billId: string) {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { data: tx } = await supabase
    .from('transactions').select('description, note').eq('id', txId).eq('user_id', user.id).single()
  if (!tx) throw new Error('Transação não encontrada')
  const name = effectiveName(tx)

  await supabase.from('fixed_rules').upsert(
    { user_id: user.id, description_pattern: name, bill_id: billId },
    { onConflict: 'user_id,description_pattern' })
  // aplica aos do mesmo nome ainda SEM conta (não sobrescreve troca manual)
  await updateMatchingByDesc(supabase, user.id, name, { fixed_bill_id: billId, is_fixed: true }, 'fixed_bill_id')
  // garante o atual mesmo se já tinha outra conta
  await supabase.from('transactions')
    .update({ fixed_bill_id: billId, is_fixed: true }).eq('id', txId).eq('user_id', user.id)

  await logActivity(supabase, user.id, {
    action: 'Marcou conta fixa', txId, description: tx.description,
    field: 'fixed_bill_id', before: null, after: billId,
  })

  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

/** Desvincula ESTE gasto da conta fixa e esquece a regra do nome dele. */
export async function clearFixedBill(txId: string) {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { data: tx } = await supabase
    .from('transactions').select('description, note, fixed_bill_id').eq('id', txId).eq('user_id', user.id).single()
  if (!tx) throw new Error('Transação não encontrada')
  const name = effectiveName(tx)

  await supabase.from('transactions')
    .update({ fixed_bill_id: null, is_fixed: false }).eq('id', txId).eq('user_id', user.id)
  // esquece a regra desse nome pra o sync não re-marcar
  await supabase.from('fixed_rules')
    .delete().eq('user_id', user.id).eq('description_pattern', name).not('bill_id', 'is', null)

  await logActivity(supabase, user.id, {
    action: 'Tirou conta fixa', txId, description: tx.description,
    field: 'fixed_bill_id', before: tx.fixed_bill_id, after: null,
  })

  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

export async function addManualTransaction(formData: FormData) {
  const { user, supabase } = await getAuthenticatedSupabase()

  const description = (formData.get('description') as string).trim()
  const amountStr   = (formData.get('amount') as string).replace(',', '.')
  const isExpense   = formData.get('type') === 'expense'
  const date        = formData.get('date') as string
  const categoryId  = (formData.get('category_id') as string) || null
  const payer       = (formData.get('payer') as string) || 'me'
  const splitStr    = formData.get('split_mine_pct') as string
  const note        = (formData.get('note') as string).trim()

  if (!description || !amountStr || !date) throw new Error('Campos obrigatórios faltando')

  const amountCents = Math.round(parseFloat(amountStr) * 100)
  if (isNaN(amountCents) || amountCents <= 0) throw new Error('Valor inválido')

  const finalAmount = isExpense ? -amountCents : amountCents
  const splitMinePct = splitStr !== '' ? parseInt(splitStr) : null

  const { error } = await supabase.from('transactions').insert({
    user_id:          user.id,
    description,
    amount_cents:     finalAmount,
    transaction_date: date,
    category_id:      categoryId || null,
    payer,
    split_mine_pct:   splitMinePct,
    note:             note || null,
    is_manual:        true,
    raw:              { manual: true },
  })

  if (error) throw new Error(error.message)

  await logActivity(supabase, user.id, { action: 'Lançamento manual', description })
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

export async function deleteManualTransaction(txId: string) {
  const { user, supabase } = await getAuthenticatedSupabase()

  const { data: tx } = await supabase
    .from('transactions').select('description').eq('id', txId).eq('user_id', user.id).single()

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', txId)
    .eq('user_id', user.id)
    .eq('is_manual', true) // só permite deletar manuais

  if (error) throw new Error(error.message)

  await logActivity(supabase, user.id, { action: 'Removeu lançamento', description: tx?.description })
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

export async function updateTransactionNote(txId: string, note: string) {
  const { user, supabase } = await getAuthenticatedSupabase()

  const { data: tx } = await supabase
    .from('transactions')
    .select('description, note')
    .eq('id', txId)
    .eq('user_id', user.id)
    .single()

  const { error } = await supabase
    .from('transactions')
    .update({ note: note.trim() || null })
    .eq('id', txId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  await logActivity(supabase, user.id, {
    action: 'Observação', txId, description: tx?.description,
    field: 'note', before: tx?.note ?? null, after: note.trim() || null,
  })
  revalidatePath('/dashboard/transacoes')
  revalidateHistorico()
}

/**
 * Muda a divisão de um gasto e aprende SÓ QUANDO É CONSISTENTE. A divisão varia
 * por compra (o mesmo Mercado Livre pode ser 100% P1, 100% P2 ou meio a meio),
 * então só vira regra quando todos os gastos daquele estabelecimento têm a MESMA
 * divisão; havendo qualquer diferença, a regra é esquecida e cada gasto fica com
 * a sua ("por gasto"). "Sem divisão" nunca cria regra — sinaliza caso a caso.
 */
export async function updateTransactionSplit(txId: string, splitMinePct: number | null) {
  const { user, supabase } = await getAuthenticatedSupabase()

  const { data: tx } = await supabase
    .from('transactions')
    .select('description, note, split_mine_pct, amount_cents, is_transfer')
    .eq('id', txId)
    .eq('user_id', user.id)
    .single()

  if (!tx) throw new Error('Transação não encontrada')

  const name = effectiveName(tx)
  const isGasto = tx.amount_cents < 0 && !tx.is_transfer

  await logActivity(supabase, user.id, {
    action: 'Divisão', txId, description: tx.description,
    field: 'split_mine_pct', before: tx.split_mine_pct, after: splitMinePct,
  })

  // Todo gasto precisa de divisão: ficar "sem divisão" manda de volta pra revisão.
  const patch: Record<string, unknown> = { split_mine_pct: splitMinePct }
  if (splitMinePct === null && isGasto) { patch.reviewed = false; patch.reviewed_at = null }

  const { error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', txId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  if (isIofDesc(name)) {
    // IOF sempre segue a compra atrelada — nunca vira regra própria de divisão.
    await supabase.from('split_rules').delete().eq('user_id', user.id).eq('description_pattern', name)
  } else if (splitMinePct === null) {
    // "sem divisão" neste gasto → não força padrão pra loja
    await supabase.from('split_rules').delete().eq('user_id', user.id).eq('description_pattern', name)
  } else {
    // olha a divisão de TODOS os gastos do mesmo nome (já com este atualizado).
    //
    // PAGINA de verdade: esta query não tinha range nem order, e o PostgREST
    // corta em 1000 linhas em silêncio (a base já passa de 1.9 mil gastos). O
    // veredito "essa loja é consistente?" saía de uma fatia arbitrária — se as
    // linhas com divisão diferente ficassem de fora, o app gravava a regra e o
    // `updateMatchingByDesc` abaixo achatava a divisão ajustada à mão.
    const target = normalizeDesc(name)
    const { rows: all, complete } = await fetchAllPagesStrict<{ description: string | null; note: string | null; split_mine_pct: number | null }>(
      (from, to) => supabase
        .from('transactions')
        .select('description, note, split_mine_pct')
        .eq('user_id', user.id)
        .order('id', { ascending: true })
        .range(from, to),
    )
    const values = all
      .filter((t) => normalizeDesc(effectiveName(t)) === target)
      .map((t) => t.split_mine_pct)
      .filter((v): v is number => v !== null)
    const distinct = [...new Set(values)]

    if (!complete) {
      // Não leu tudo: não dá pra afirmar consistência, e o preço de errar é
      // reescrever o histórico. A divisão deste gasto já foi salva acima; só o
      // aprendizado fica de fora desta vez.
      console.warn('[split] leitura incompleta — não aprendi a divisão de', name)
    } else if (distinct.length <= 1) {
      // consistente → vira regra e preenche os iguais que ainda não têm divisão
      await supabase.from('split_rules').upsert(
        { user_id: user.id, description_pattern: name, split_mine_pct: splitMinePct, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,description_pattern' })
      await updateMatchingByDesc(supabase, user.id, name, { split_mine_pct: splitMinePct }, 'split_mine_pct')
    } else {
      // varia por gasto (ex.: Mercado Livre ora P1, ora P2) → não aprende
      await supabase.from('split_rules').delete().eq('user_id', user.id).eq('description_pattern', name)
    }
    // o nome junta as parcelas dos dois cartões; parcela individual volta pro
    // dono. E o IOF desta compra acompanha a divisão nova já, sem esperar o sync.
    await applyInstallmentOwnerSplit(user.id, supabase)
    await linkIofToPurchase(user.id, supabase)
  }

  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
  revalidatePath('/dashboard/fechamento')
  revalidatePath('/dashboard/entradas')
  revalidatePath('/dashboard/aprendizados')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

export async function updateCategory(id: string, name: string, emoji: string, color?: string) {
  const { supabase } = await getAuthenticatedSupabase()
  const { error } = await supabase
    .from('categories')
    .update({ name: name.trim(), emoji: emoji.trim() || '📦', ...(color ? { color } : {}) })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/categorias')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
}

export async function createCategory(name: string, emoji: string, color: string) {
  const { user, supabase } = await getAuthenticatedSupabase()

  const { error } = await supabase
    .from('categories')
    .insert({ name: name.trim(), emoji: emoji.trim() || '📦', color, user_id: user.id })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/categorias')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
}

export async function deleteCategory(categoryId: string) {
  const { supabase } = await getAuthenticatedSupabase()
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/categorias')
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/pendentes')
}

export async function recategorizarTudo() {
  const { user, supabase } = await getAuthenticatedSupabase()
  await applyCategoryRules(user.id, supabase)
  await applySplitRules(user.id, supabase)
  await applyInstallmentOwnerSplit(user.id, supabase)
  await linkIofToPurchase(user.id, supabase)
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard')
}

/**
 * Marca/desmarca "não é um gasto" (⇄) e APRENDE: marcar guarda a descrição em
 * transfer_rules e marca os iguais também — os próximos syncs re-marcam sozinhos.
 * Desmarcar apaga a regra (pra o sync não re-marcar) e volta ESTE gasto pra fila.
 */
export async function toggleTransfer(txId: string, isTransfer: boolean) {
  const { user, supabase } = await getAuthenticatedSupabase()
  const { data: tx } = await supabase
    .from('transactions').select('description, note').eq('id', txId).eq('user_id', user.id).single()
  if (!tx) throw new Error('Transação não encontrada')
  const name = effectiveName(tx)

  const { error } = await supabase
    .from('transactions')
    .update({ is_transfer: isTransfer })
    .eq('id', txId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  if (isTransfer) {
    await supabase.from('transfer_rules').upsert(
      { user_id: user.id, description_pattern: name },
      { onConflict: 'user_id,description_pattern' })
    // deixa de ser exceção: ela mudou de ideia e agora É transferência
    await supabase.from('transfer_exceptions').delete().eq('user_id', user.id).eq('description_pattern', name)
    await updateMatchingByDesc(supabase, user.id, name, { is_transfer: true })
  } else {
    await supabase.from('transfer_rules').delete().eq('user_id', user.id).eq('description_pattern', name)
    // GRAVA A EXCEÇÃO: só apagar a regra não bastava. A marcação automática por
    // nome do casal (src/lib/transfers.ts) não consulta transfer_rules, então o
    // próximo sync re-engolia a entrada — era o caso do pró-labore da pessoa 2.
    const { error: excErr } = await supabase.from('transfer_exceptions').upsert(
      { user_id: user.id, description_pattern: name },
      { onConflict: 'user_id,description_pattern' })
    if (excErr) console.warn('[toggleTransfer] não gravei a exceção:', excErr.message)
  }

  await logActivity(supabase, user.id, {
    action: isTransfer ? 'Marcou não-gasto' : 'Desmarcou não-gasto', txId, description: tx.description,
    field: 'is_transfer', before: !isTransfer, after: isTransfer,
  })
  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard/entradas')
  revalidatePath('/dashboard/investimentos')
  revalidatePath('/dashboard/aprendizados')
  revalidatePath('/dashboard')
  revalidateHistorico()
}

export async function updateTransactionPayer(txId: string, payer: 'me' | 'pessoa2') {
  const { user, supabase } = await getAuthenticatedSupabase()

  const { error } = await supabase
    .from('transactions')
    .update({ payer })
    .eq('id', txId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/transacoes')
  revalidatePath('/dashboard')
}
