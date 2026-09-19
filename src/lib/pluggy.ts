/**
 * Pluggy server-side client.
 * NUNCA importe este módulo em Client Components — contém segredos.
 */

const BASE = 'https://api.pluggy.ai'

// ─── Auth ────────────────────────────────────────────────────────────────────

/** Retorna um apiKey fresco (expira em 2h). Chame no início de cada operação. */
export async function getApiKey(): Promise<string> {
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID!,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
    }),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Pluggy /auth falhou: ${res.status}`)
  const data = await res.json()
  return data.apiKey as string
}

// ─── Connect Token ───────────────────────────────────────────────────────────

/** Cria um connectToken de uso único para o widget (expira em 30 min). */
export async function createConnectToken(
  clientUserId: string,
  itemId?: string,
): Promise<string> {
  const apiKey = await getApiKey()

  const res = await fetch(`${BASE}/connect_token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      ...(itemId ? { itemId } : {}),
      options: {
        clientUserId,
        // avoidDuplicates desligado: o banco foi resetado mas o Pluggy mantém
        // itens antigos. A trava bloquearia reconectar (ITEM_USER_ALREADY_EXISTS).
        // Registra webhook por item automaticamente
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? {
              webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/pluggy/webhook`,
            }
          : {}),
      },
    }),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Pluggy /connect_token falhou: ${res.status}`)
  const data = await res.json()
  return data.accessToken as string
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export interface PluggyAccount {
  id: string
  name: string
  type: 'BANK' | 'CREDIT'
  subtype: string
  balance: number
  currencyCode: string
  itemId: string
  creditData?: {
    balanceDueDate?: string | null    // ISO8601 — vencimento da fatura
    balanceCloseDate?: string | null  // fechamento da fatura
    availableCreditLimit?: number | null
  } | null
}

export async function getAccounts(itemId: string): Promise<PluggyAccount[]> {
  const apiKey = await getApiKey()

  const res = await fetch(`${BASE}/accounts?itemId=${itemId}`, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Pluggy /accounts falhou: ${res.status}`)
  const data = await res.json()
  return data.results as PluggyAccount[]
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface PluggyTransaction {
  id: string
  description: string
  descriptionRaw: string | null
  amount: number
  date: string          // ISO8601
  type: 'DEBIT' | 'CREDIT'
  status: 'POSTED' | 'PENDING'
  category: string | null
  creditCardMetadata?: {
    installmentNumber?: number | null
    totalInstallments?: number | null
    totalAmount?: number | null
    purchaseDate?: string | null
  } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any    // restante vai para raw (jsonb)
}

export async function getTransactions(
  accountId: string,
  from?: string, // yyyy-mm-dd
  to?: string,
): Promise<PluggyTransaction[]> {
  const apiKey = await getApiKey()

  // Pagina TODAS as páginas: a Pluggy retorna no máximo pageSize por request.
  // Sem o loop, janelas com mais de 500 lançamentos perdiam silenciosamente
  // os mais antigos (só a página 1 — as transações mais recentes — era salva).
  const all: PluggyTransaction[] = []
  let page = 1
  let totalPages = 1

  do {
    const params = new URLSearchParams({
      accountId,
      pageSize: '500',
      page: String(page),
    })
    if (from) params.set('from', from)
    if (to)   params.set('to', to)

    const res = await fetch(`${BASE}/transactions?${params}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    })

    if (!res.ok) throw new Error(`Pluggy /transactions falhou: ${res.status}`)
    const data = await res.json()
    all.push(...(data.results as PluggyTransaction[]))
    totalPages = data.totalPages ?? 1
    page++
  } while (page <= totalPages)

  return all
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normaliza o amount Pluggy → amount_cents do nosso schema.
 * Regra: DEBIT = negativo (gasto), CREDIT = positivo (entrada).
 */
export function toAmountCents(tx: PluggyTransaction): number {
  const abs = Math.round(Math.abs(tx.amount) * 100)
  return tx.type === 'DEBIT' ? -abs : abs
}
