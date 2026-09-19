/**
 * Detecta transferências internas: debit em uma conta + credit de mesmo valor
 * em outra conta do mesmo usuário, dentro de 2 dias E com o nome do casal em
 * pelo menos um dos lados. Marca ambas como is_transfer=true para excluir dos
 * cálculos. A exigência do nome evita que gasto real + entrada real de mesmo
 * valor (coincidência) sumam das telas.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PG_MAX_ROWS } from './paginate'

// Nomes das DUAS pessoas do household. Transferência (enviada/recebida) cujo
// outro lado é uma delas = movimentação interna (não é gasto nem renda).
// Vem de NOMES_DO_CASAL (separados por vírgula, como aparecem
// no extrato: "maria silva, joana souza").
const HOUSEHOLD_NAME_PATTERNS = (process.env.NOMES_DO_CASAL ?? '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

const householdNameFilter = HOUSEHOLD_NAME_PATTERNS
  .map((p) => `description.ilike.%${p}%`)
  .join(',')

// HOUSEHOLD_NAME_PATTERNS já vem em minúsculas.
const hasHouseholdName = (desc: string | null): boolean => {
  const d = (desc ?? '').toLowerCase()
  return HOUSEHOLD_NAME_PATTERNS.some((p) => d.includes(p))
}

export async function detectInternalTransfers(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  // Busca transações recentes ainda não marcadas como transferência
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, amount_cents, transaction_date, account_id, description')
    .eq('user_id', userId)
    .eq('is_transfer', false)
    .eq('is_manual', false)
    .order('transaction_date', { ascending: false })
    .limit(500)

  if (!txs || txs.length < 2) return

  // IDs de todas as contas deste usuário (para confirmar que é "própria conta")
  const { data: userAccounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('excluded', false)

  const ownAccountIds = new Set((userAccounts ?? []).map((a) => a.id))

  const debits  = txs.filter((t) => t.amount_cents < 0  && ownAccountIds.has(t.account_id))
  const credits = txs.filter((t) => t.amount_cents > 0  && ownAccountIds.has(t.account_id))

  const toMark: string[] = []

  for (const debit of debits) {
    const debitDate = new Date(debit.transaction_date)

    const match = credits.find((credit) => {
      if (credit.account_id === debit.account_id) return false // mesma conta, não é transfer
      if (credit.amount_cents !== Math.abs(debit.amount_cents)) return false

      // Corroboração: valor+data iguais NÃO bastam. Sem exigir o nome do casal
      // em um dos lados, um gasto real e uma entrada real de mesmo valor dentro
      // de 2 dias (ex.: compra de R$50 + amigo te pagando R$50) eram marcados
      // como transferência e sumiam de todas as telas. Casos por CPF ficam por
      // conta do detectCpfInternalTransfers, que roda logo depois.
      if (!hasHouseholdName(debit.description) && !hasHouseholdName(credit.description)) return false

      const diff = Math.abs(
        new Date(credit.transaction_date).getTime() - debitDate.getTime()
      )
      return diff <= 2 * 24 * 60 * 60 * 1000 // dentro de 2 dias
    })

    if (match) {
      toMark.push(debit.id, match.id)
      // remove do array pra não reutilizar o mesmo credit duas vezes
      credits.splice(credits.indexOf(match), 1)
    }
  }

  if (toMark.length > 0) {
    await supabase
      .from('transactions')
      .update({ is_transfer: true })
      .in('id', toMark)
  }

  // Marca por padrão de descrição: transferência entre as duas (enviada OU
  // recebida) — é movimentação interna do casal, não gasto nem renda.
  //
  // MENOS o que ela já disse que é gasto/entrada de verdade. Esta regra não olha
  // sinal nem contraparte, então engolia o pró-labore da PJ da pessoa 2 (uma
  // ENTRADA com o nome dela na descrição). Desmarcar no "⇄" não resolvia: o sync
  // seguinte re-marcava, porque esta query não consultava exceção nenhuma.
  if (!householdNameFilter) return // NOMES_DO_CASAL vazio: nada pra casar
  const excecoes = await loadTransferExceptions(userId, supabase)
  let byName = supabase
    .from('transactions')
    .update({ is_transfer: true })
    .eq('user_id', userId)
    .eq('is_transfer', false)
    .eq('is_manual', false)
    .or(householdNameFilter)
  for (const padrao of excecoes) {
    byName = byName.not('description', 'ilike', `%${padrao}%`)
  }
  await byName
}

/**
 * Descrições que a pessoa marcou explicitamente como "É gasto/entrada" no botão
 * "⇄". A marcação automática por nome não toca mais nelas.
 *
 * Tabela nova (migration 20260910100000). Se ela ainda não foi aplicada, devolve
 * lista vazia em vez de derrubar o sync — o comportamento volta a ser o antigo.
 */
export async function loadTransferExceptions(
  userId: string,
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('transfer_exceptions')
    .select('description_pattern')
    .eq('user_id', userId)
  if (error) {
    console.warn('[transfers] transfer_exceptions indisponível:', error.message)
    return []
  }
  return (data ?? []).map((r) => r.description_pattern as string).filter(Boolean)
}

/**
 * Dedupe entre contas da MESMA conexão (mesmo pluggy_item_id):
 * o mesmo movimento às vezes é lançado em duas contas do mesmo item
 * (ex.: cota da XP aparecendo na conta de investimento e na corrente).
 * Identifica grupos com mesmo (item, data, valor, descrição) em contas
 * DIFERENTES, mantém a cópia mais antiga e marca as demais como is_transfer,
 * anotando o motivo em `note`. Reversível pelo botão "⇄".
 */
export async function detectCrossAccountDuplicates(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  // account_id → pluggy_item_id (só contas ativas deste usuário)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, pluggy_item_id')
    .eq('user_id', userId)

  const itemByAccount = new Map(
    (accounts ?? [])
      .filter((a) => a.pluggy_item_id)
      .map((a) => [a.id, a.pluggy_item_id as string]),
  )
  if (itemByAccount.size === 0) return

  const { data: txs } = await supabase
    .from('transactions')
    .select('id, account_id, amount_cents, transaction_date, description, created_at, note')
    .eq('user_id', userId)
    .eq('is_transfer', false)
    .eq('is_manual', false)
    // Duplicata entre contas aparece no mesmo dia: as mais recentes bastam.
    // O teto do PostgREST é 1000 e `.limit(2000)` não levantava isso — só
    // prometia uma cobertura que nunca existiu. O `.order` fixa QUAIS 1000.
    .order('transaction_date', { ascending: false })
    .limit(PG_MAX_ROWS)

  if (!txs || txs.length < 2) return

  // Agrupa por item|data|valor|descrição normalizada
  const groups = new Map<string, typeof txs>()
  for (const t of txs) {
    const item = itemByAccount.get(t.account_id)
    if (!item) continue
    const desc = (t.description ?? '').trim().toLowerCase()
    const key = `${item}|${t.transaction_date}|${t.amount_cents}|${desc}`
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }

  const REASON = 'Duplicata entre contas (mesma conexão)'
  const updates: Array<{ id: string; note: string }> = []

  for (const arr of groups.values()) {
    if (arr.length < 2) continue
    // só dedupe quando o mesmo movimento está em contas diferentes
    if (new Set(arr.map((t) => t.account_id)).size < 2) continue

    // mantém a cópia mais antiga (menor created_at)
    const sorted = [...arr].sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)),
    )
    const keep = sorted[0]
    for (const dup of sorted.slice(1)) {
      if (dup.account_id === keep.account_id) continue // não mexe em cópia da mesma conta
      const note = dup.note ? `${dup.note} · ${REASON}` : REASON
      updates.push({ id: dup.id, note })
    }
  }

  for (const u of updates) {
    await supabase
      .from('transactions')
      .update({ is_transfer: true, note: u.note })
      .eq('id', u.id)
  }
}

/**
 * Pagamento de fatura de cartão NÃO é um gasto novo: as compras da fatura já
 * entram uma a uma como gasto no próprio cartão. Contar o pagamento de novo =
 * gasto em dobro. É só dinheiro saindo da conta pra quitar o cartão.
 *
 * Marca is_transfer=true nos DOIS lados que a Pluggy traz:
 *   • débito na conta corrente ("Pagamento de fatura", "Pagamento de cartão…")
 *   • crédito no cartão que abate o saldo ("Pagamento recebido"/"Pagamento")
 *
 * Reversível pelo botão "⇄" caso um pagamento de fatura de serviço (energia,
 * telecom via boleto) seja pego por engano — esses costumam vir com o nome do
 * fornecedor e cair numa categoria de gasto real, não nesses padrões.
 */
const BILL_PAYMENT_PATTERNS = [
  'pagamento de fatura',
  'pagamento fatura',
  'pag fatura',
  'pgto fatura',
  'pgto de fatura',
  'pagto fatura',
  'pagto de fatura',
  'pagamento de cartao',
  'pagamento de cartão',
  'pagamento cartao de credito',
  'pagamento cartão de crédito',
]

const billPaymentFilter = BILL_PAYMENT_PATTERNS
  .map((p) => `description.ilike.%${p}%`)
  .join(',')

export async function detectCreditCardBillPayments(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  // 1) Por descrição: "pagamento de fatura / de cartão" em qualquer conta.
  //    É sempre movimentação (quitar o cartão), nunca gasto nem renda.
  await supabase
    .from('transactions')
    .update({ is_transfer: true })
    .eq('user_id', userId)
    .eq('is_transfer', false)
    .eq('is_manual', false)
    .or(billPaymentFilter)

  // 2) Pelo lado do cartão: o abatimento da fatura vem como CRÉDITO (positivo)
  //    na conta de cartão, geralmente "Pagamento recebido"/"Pagamento". Restringe
  //    a contas 'credit' e a positivos pra não confundir com Pix/renda na corrente
  //    nem com estorno/reembolso de compra (que reduz gasto de verdade).
  const { data: creditAccounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'credit')

  const creditIds = (creditAccounts ?? []).map((a) => a.id)
  if (creditIds.length > 0) {
    await supabase
      .from('transactions')
      .update({ is_transfer: true })
      .eq('user_id', userId)
      .eq('is_transfer', false)
      .eq('is_manual', false)
      .in('account_id', creditIds)
      .gt('amount_cents', 0)
      .or('description.ilike.%pagamento%,description.ilike.%pgto%')
  }
}

/**
 * Transferência interna detectada pelo CPF do Pix/TED (mais confiável que nome).
 * Dinheiro entre contas de vocês NÃO é gasto nem renda:
 *  - mesma pessoa em bancos diferentes (ex.: pessoa 1 Nubank → pessoa 1 InfinitePay)
 *  - entre as duas (pessoa 1 ↔ pessoa 2)
 *
 * Os CPFs "de vocês" são derivados dos próprios dados (sem hardcode): em toda
 * transação das suas contas, o lado de vocês é o payer (no débito) ou o receiver
 * (no crédito) — esse documentNumber é o CPF do dono da conta. Uma transação é
 * interna quando a CONTRAPARTE (receiver no débito, payer no crédito) é um desses
 * CPFs. Reversível pelo botão "⇄".
 */
export async function detectCpfInternalTransfers(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('excluded', false)
  const ownAccountIds = new Set((accounts ?? []).map((a) => a.id))
  if (ownAccountIds.size === 0) return

  // pd = raw.paymentData (subpath, p/ não trazer o raw inteiro)
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, account_id, amount_cents, is_transfer, pd:raw->paymentData')
    .eq('user_id', userId)
    .eq('is_manual', false)
    .not('raw->paymentData', 'is', null)
    // Idem: pagamento de fatura é casado dentro do ciclo corrente, e o teto do
    // PostgREST é 1000 de qualquer jeito.
    .order('transaction_date', { ascending: false })
    .limit(PG_MAX_ROWS)
  if (!txs || txs.length === 0) return

  const cpf = (side: 'payer' | 'receiver', t: (typeof txs)[number]): string | null => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (t.pd as any)?.[side]?.documentNumber
    return d?.type === 'CPF' && d.value ? (d.value as string) : null
  }

  // 1) CPFs de vocês: o SEU lado de cada transação das suas contas
  //    (payer no débito, receiver no crédito).
  const ownCpfs = new Set<string>()
  for (const t of txs) {
    if (!ownAccountIds.has(t.account_id)) continue
    const mine = t.amount_cents < 0 ? cpf('payer', t) : cpf('receiver', t)
    if (mine) ownCpfs.add(mine)
  }
  if (ownCpfs.size === 0) return

  // 2) interno = contraparte é um CPF de vocês
  const toMark: string[] = []
  for (const t of txs) {
    if (t.is_transfer) continue
    const counter = t.amount_cents < 0 ? cpf('receiver', t) : cpf('payer', t)
    if (counter && ownCpfs.has(counter)) toMark.push(t.id)
  }
  if (toMark.length === 0) return

  await supabase
    .from('transactions')
    .update({ is_transfer: true })
    .in('id', toMark)
}

/**
 * Movimentacao de dinheiro que a PROPRIA Pluggy ja identifica como tal.
 *
 * `raw.category` traz a leitura do banco/da Pluggy sobre a natureza do
 * lancamento, e algumas dessas categorias nunca sao consumo — sao dinheiro
 * trocando de forma ou de lugar:
 *
 *   Transfer - Foreign Exchange  compra de moeda pra viagem (o dinheiro vira
 *                                euro, nao vira gasto; ele vira gasto quando
 *                                for gasto la fora, no cartao ou em especie)
 *   Investments                  aporte/aplicacao — patrimonio mudando de lugar
 *   Same person transfer         voce mandando pra voce mesma
 *   Credit card payment          quitar a fatura (as compras ja entraram uma a uma)
 *   Transfer - Internal          movimentacao interna do banco
 *
 * As tres ultimas ja sao pegas pelos detectores por CPF e por descricao; entram
 * aqui de novo de proposito, porque a categoria da Pluggy pega tambem os casos
 * em que a descricao veio generica demais pra casar.
 *
 * A que faltava era a primeira: um cambio de R$ 29.673 em maio/2026 entrou como
 * gasto de "Lazer" e sozinho respondeu por um terco do mes.
 *
 * Reversivel pelo botao "⇄", como todos os outros.
 */
const PLUGGY_MOVEMENT_CATEGORIES = [
  'Transfer - Foreign Exchange',
  'Investments',
  'Same person transfer',
  'Credit card payment',
  'Transfer - Internal',
]

export async function detectPluggyMoneyMovement(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase
    .from('transactions')
    .update({ is_transfer: true })
    .eq('user_id', userId)
    .eq('is_transfer', false)
    .eq('is_manual', false)
    .in('raw->>category', PLUGGY_MOVEMENT_CATEGORIES)
}
