/**
 * Lógica central de sync Pluggy → Supabase.
 * Usada pelo sync manual (/api/pluggy/sync) e pelo webhook.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getAccounts,
  getTransactions,
  toAmountCents,
  type PluggyTransaction,
} from './pluggy'
import { applyCategoryRules, markInvestmentsAsTransfer, linkIofToPurchase } from './categorize'
import { applySplitRules, applyInstallmentOwnerSplit } from './splits'
import { applyFixedRules } from './fixed'
import { detectInternalTransfers, detectCrossAccountDuplicates, detectCpfInternalTransfers, detectCreditCardBillPayments, detectPluggyMoneyMovement } from './transfers'
import { applyTransferRules } from './transfer-rules'
import { bounceUndividedToReview } from './require-split'
import { loadDescIndex } from './rules'
import { syncFrom, splitNewAndExisting, matchReplacedIds, dedupeIncoming, type DbTxRef } from './sync-window'
import { matchParcelaRemarcada } from './sync-parcela'
import { fetchAllPages } from './paginate'

export interface SyncResult {
  accounts: number
  transactions: number
}

/** Sincroniza todos as contas de um item (usado no connect manual). */
export async function syncItem(
  itemId: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const pluggyAccounts = await getAccounts(itemId)
  const result: SyncResult = { accounts: 0, transactions: 0 }

  for (const pa of pluggyAccounts) {
    // Lê estado anterior ANTES do upsert (last_synced_at, owner, default_split)
    const { data: existing } = await supabase
      .from('accounts')
      .select('last_synced_at, owner, excluded, name')
      .eq('pluggy_account_id', pa.id)
      .maybeSingle()

    if (existing?.excluded) continue  // conta excluída pelo usuário — nunca re-criar

    const { data: account, error } = await supabase
      .from('accounts')
      .upsert(
        {
          user_id: userId,
          pluggy_item_id: itemId,
          pluggy_account_id: pa.id,
          type: pa.type === 'CREDIT' ? 'credit' : 'checking',
          balance_cents: Math.round(pa.balance * 100),
          balance_due_date: pa.creditData?.balanceDueDate?.slice(0, 10) ?? null,
          // name precisa SEMPRE estar no upsert: o Postgres valida o NOT NULL
          // na tentativa de INSERT antes de resolver o ON CONFLICT→UPDATE, então
          // omitir name num re-sync quebra com 23502. Preserva o nome customizado
          // (existing.name) e só usa o nome cru do Pluggy na criação.
          name: existing?.name ?? pa.name,
          ...(existing?.owner ? {} : { owner: 'me' }),
        },
        { onConflict: 'pluggy_account_id' },
      )
      .select('id')
      .single()

    if (error || !account) {
      console.error('[sync] upsert account falhou:', error)
      continue
    }

    result.accounts++

    const from = syncFrom(existing?.last_synced_at)

    // Determina payer desta conta (split é gerenciado por applySplitRules)
    const accountOwner = existing?.owner ?? 'me'

    const txCount = await upsertTransactions(
      pa.id,
      account.id,
      userId,
      supabase,
      from,
      undefined,
      accountOwner,
    )
    result.transactions += txCount
  }

  await runPostSyncRules(userId, supabase)

  return result
}

/**
 * Pipeline de regras que roda DEPOIS de inserir transações: categorização,
 * split, contas fixas e todas as detecções de "não é gasto" (transferências
 * internas, CPF, duplicatas, pagamento de fatura, investimentos).
 * Idempotente — seguro chamar em todo sync, manual ou webhook.
 */
export async function runPostSyncRules(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  // UMA leitura das transações serve a todas as regras por descrição. São
  // ~1.050 regras aprendidas hoje, e antes cada uma fazia o próprio SELECT +
  // UPDATE: ~1.500 requests e ~163 mil linhas lidas por execução — a cada
  // webhook da Pluggy. É o que estava consumindo o projeto no Supabase.
  const index = await loadDescIndex(supabase, userId)

  await applyCategoryRules(userId, supabase, index)
  await applySplitRules(userId, supabase, index)
  await applyInstallmentOwnerSplit(userId, supabase)
  // DEPOIS do split: o IOF espelha categoria E divisão da compra atrelada.
  // Escreve category_id/split_mine_pct por SQL próprio, então daqui pra frente
  // o índice está defasado NESSES dois campos — inofensivo, porque o que vem
  // depois só usa o guard de fixed_bill_id (ou nenhum guard).
  await linkIofToPurchase(userId, supabase)
  await applyFixedRules(userId, supabase, index)
  await detectInternalTransfers(userId, supabase)
  await detectCpfInternalTransfers(userId, supabase)
  await detectCrossAccountDuplicates(userId, supabase)
  await detectCreditCardBillPayments(userId, supabase)
  await detectPluggyMoneyMovement(userId, supabase)
  await applyTransferRules(userId, supabase, index)
  await markInvestmentsAsTransfer(userId, supabase)
  // Por último (splits já aplicados): gasto sem divisão volta pra revisão.
  await bounceUndividedToReview(userId, supabase)
}

/**
 * Sincroniza transações de uma conta específica a partir de uma lista
 * já buscada (usado pelo webhook transactions/created com link direto).
 */
export async function syncTransactionsFromList(
  pluggyAccountId: string,
  accountId: string,
  userId: string,
  supabase: SupabaseClient,
  txs: PluggyTransaction[],
): Promise<number> {
  // Busca configurações da conta para aplicar payer/split
  const { data: acc } = await supabase
    .from('accounts')
    .select('owner, default_split_mine_pct')
    .eq('id', accountId)
    .maybeSingle()

  const count = await upsertTransactions(
    pluggyAccountId,
    accountId,
    userId,
    supabase,
    undefined,
    txs,
    acc?.owner ?? 'me',
  )

  // Aplica as mesmas regras do sync manual para que transações vindas do webhook
  // (real-time) já cheguem categorizadas e com pagamento de fatura / transferência
  // marcados — sem isso, vazariam pra fila de aprovação até o próximo sync completo.
  await runPostSyncRules(userId, supabase)

  return count
}

// ─── Internals ────────────────────────────────────────────────────────────────

/** Quebra em blocos — o PostgREST tem limite de linhas por request. */
function chunk<T>(arr: T[], tamanho: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += tamanho) out.push(arr.slice(i, i + tamanho))
  return out
}

async function upsertTransactions(
  pluggyAccountId: string,
  accountId: string,
  userId: string,
  supabase: SupabaseClient,
  from?: string,
  existingTxs?: PluggyTransaction[],
  accountOwner: string = 'me',
): Promise<number> {
  const to = new Date().toISOString().slice(0, 10)
  const txs = existingTxs ?? (await getTransactions(pluggyAccountId, from, to))

  if (txs.length === 0) return 0

  // payer: contas 'shared' ou 'pessoa2' → pessoa 2 é quem paga a fatura
  const payer = accountOwner === 'me' ? 'me' : 'pessoa2'

  const rows = txs
    .map((tx) => ({
      user_id: userId,
      account_id: accountId,
      pluggy_transaction_id: tx.id,
      description: tx.description || tx.descriptionRaw || 'Sem descrição',
      amount_cents: toAmountCents(tx),
      transaction_date: tx.date.slice(0, 10),
      installment_number: tx.creditCardMetadata?.installmentNumber ?? null,
      total_installments: tx.creditCardMetadata?.totalInstallments ?? null,
      is_manual: false,
      payer,
      // split_mine_pct NÃO entra no upsert — é gerenciado por applySplitRules
      // para não sobrescrever edições manuais no re-sync
      raw: tx,
    }))

  if (rows.length === 0) return 0

  // A janela re-varre 90 dias, então a maioria das linhas já existe. Upsert cego
  // sobrescreveria o `payer` editado na mão a cada sync — por isso o split: quem
  // é novo entra inteiro, quem já existe só tem os campos do banco atualizados.
  // O que já está gravado nesta conta dentro da janela. Precisa ser por
  // conta+data, e NÃO pelos ids que a Pluggy acabou de mandar: quando um
  // lançamento sai de PENDING pra POSTED ele ganha um id novo e o antigo some
  // da resposta — buscando só pelos ids novos, a versão PENDING nunca aparece e
  // o mesmo gasto entra duas vezes (inclusive fatura de dezenas de milhares).
  const desde = rows.reduce((min, r) => (r.transaction_date < min ? r.transaction_date : min), rows[0].transaction_date)
  const noBanco = await fetchAllPages<DbTxRef>((de, ate) =>
    supabase
      .from('transactions')
      .select('pluggy_transaction_id, transaction_date, amount_cents, description, installment_number, total_installments')
      .eq('account_id', accountId)
      .gte('transaction_date', desde)
      .order('pluggy_transaction_id', { ascending: true })
      .range(de, ate),
  )

  const idsNoBanco = new Set(noBanco.map((r) => r.pluggy_transaction_id))

  // 1) A Pluggy repete a mesma quitação de fatura com dois ids (as duas POSTED,
  // mesma data/valor/descrição). Colapsa antes do upsert, senão o pagamento
  // entra dobrado a cada sync.
  const { kept: linhas, dropped } = dedupeIncoming(rows, idsNoBanco)
  if (dropped.length > 0) {
    console.log(`[sync] ${dropped.length} cópia(s) repetida(s) pela Pluggy ignorada(s)`)
  }

  // 2) Renomeia o id da linha antiga pro id novo: aí o upsert logo abaixo
  // ATUALIZA essa linha em vez de inserir outra, preservando categoria,
  // divisão e nota.
  const trocados = matchReplacedIds(
    linhas.map((r) => ({
      id: r.pluggy_transaction_id,
      transaction_date: r.transaction_date,
      amount_cents: r.amount_cents,
      description: r.description,
    })),
    noBanco,
  )
  for (const [velho, novo] of trocados) {
    const { error } = await supabase
      .from('transactions')
      .update({ pluggy_transaction_id: novo })
      .eq('account_id', accountId)
      .eq('pluggy_transaction_id', velho)
    if (error) console.error('[sync] troca de id PENDING→POSTED falhou:', error)
  }
  if (trocados.size > 0) console.log(`[sync] ${trocados.size} lançamento(s) PENDING→POSTED casados por data+valor+descrição`)

  // 2b) PARCELA REMARCADA: a Pluggy às vezes devolve a mesma parcela com OUTRA
  // data (a do ciclo da fatura, dia 1º/2, em vez da data da compra) e id novo.
  // O casamento acima exige data exata, então não pega esse caso — foi ele que
  // duplicou 45 lançamentos e R$ 14.098,05 de gasto em julho/agosto de 2026.
  // Parcela tem identidade forte (loja + valor + "3/3"), então aqui a data vira
  // janela de tolerância em vez de chave.
  const jaCasados = new Set(trocados.keys())
  const remarcadas = matchParcelaRemarcada(
    linhas
      .filter((r) => !trocados.has(r.pluggy_transaction_id))
      .map((r) => ({
        id: r.pluggy_transaction_id,
        transaction_date: r.transaction_date,
        amount_cents: r.amount_cents,
        description: r.description,
        installment_number: r.installment_number,
        total_installments: r.total_installments,
      })),
    noBanco.filter((r) => !jaCasados.has(r.pluggy_transaction_id)),
  )
  for (const [velho, novo] of remarcadas) {
    const { error } = await supabase
      .from('transactions')
      .update({ pluggy_transaction_id: novo, transaction_date: linhas.find((l) => l.pluggy_transaction_id === novo)?.transaction_date })
      .eq('account_id', accountId)
      .eq('pluggy_transaction_id', velho)
    if (error) console.error('[sync] troca de id de parcela remarcada falhou:', error)
    else trocados.set(velho, novo)
  }
  if (remarcadas.size > 0) console.log(`[sync] ${remarcadas.size} parcela(s) remarcada(s) pela Pluggy casada(s) por loja+valor+parcela`)

  const existingIds = new Set(idsNoBanco)
  for (const novo of trocados.values()) existingIds.add(novo)

  const { inserts, updates } = splitNewAndExisting(linhas, existingIds)

  for (const bloco of [...chunk(inserts, 300), ...chunk(updates, 300)]) {
    const { error } = await supabase
      .from('transactions')
      .upsert(bloco, { onConflict: 'pluggy_transaction_id' })

    if (error) {
      console.error('[sync] upsert transactions falhou:', error)
      return 0
    }
  }

  // Atualiza last_synced_at da conta
  await supabase
    .from('accounts')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('pluggy_account_id', pluggyAccountId)

  // Conta só o que é novo — com a janela larga, o total re-varrido não diz nada.
  return inserts.length
}
