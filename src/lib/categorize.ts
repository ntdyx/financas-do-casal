/**
 * Auto-categorização: regras do usuário + padrões de descrição + mapeamento Pluggy.
 * Usado durante o sync para pré-categorizar transações novas.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages, PG_MAX_ROWS } from './paginate'
import { isIof, pairIofSplits, type IofTx } from './iof'
import { loadDescIndex, matchRows, matchIlike, stage, newPending, flushPatches, type DescIndex } from './rules'

/**
 * Padrões ILIKE por descrição → categoria.
 * Ordem importa: primeiro match ganha.
 */
const DESCRIPTION_PATTERNS: Array<{ pattern: string; category: string }> = [
  // Cashback é entrada (dinheiro de volta), não investimento — vem antes de
  // "%resgate%" p/ "Resgate de Cashback" não cair em Investimento.
  { pattern: '%cashback%',        category: 'Outros' },
  // ── Investimento (prioridade: antes de tudo, p/ não cair em "Outros") ─────────
  { pattern: '%cessao de cotas%', category: 'Investimento' },
  { pattern: '%cessão de cotas%', category: 'Investimento' },
  { pattern: '%aplicacao%',       category: 'Investimento' },
  { pattern: '%aplicação%',       category: 'Investimento' },
  { pattern: '%resgate%',         category: 'Investimento' },
  { pattern: '%tesouro%',         category: 'Investimento' },
  { pattern: '%cdb%',             category: 'Investimento' },
  { pattern: '%lci%',             category: 'Investimento' },
  { pattern: '%lca%',             category: 'Investimento' },
  { pattern: '%previdencia%',     category: 'Investimento' },
  { pattern: '%previdência%',     category: 'Investimento' },
  { pattern: '%renda fixa%',      category: 'Investimento' },
  { pattern: '%fundo de inv%',    category: 'Investimento' },
  { pattern: '%debenture%',       category: 'Investimento' },
  { pattern: '%debênture%',       category: 'Investimento' },
  { pattern: '%investimento%',    category: 'Investimento' }, // "transferência p/ conta investimento" etc.
  { pattern: '%aporte%',          category: 'Investimento' },
  { pattern: '%premio de opcoes%', category: 'Investimento' }, // derivativos B3 ("Prêmio de Opções sem CCP")
  { pattern: '%prêmio de opções%', category: 'Investimento' },
  { pattern: '%opcoes%',          category: 'Investimento' },
  { pattern: '%opções%',          category: 'Investimento' },
  // ── Transferências (visível; somam nos totais — internas tratadas por "⇄") ────
  { pattern: '%transferencia%',   category: 'Transferências' },
  { pattern: '%transferência%',   category: 'Transferências' },
  { pattern: '%pix enviado%',     category: 'Transferências' },
  { pattern: '%ted enviado%',     category: 'Transferências' },
  { pattern: '%doc enviado%',     category: 'Transferências' },
  // ── Mercado ──────────────────────────────────────────────────────────────────
  { pattern: '%pao de acucar%',   category: 'Mercado' },
  { pattern: '%pão de açúcar%',   category: 'Mercado' },
  { pattern: '%carrefour%',       category: 'Mercado' },
  { pattern: '%extra hiper%',     category: 'Mercado' },
  { pattern: '%atacadao%',        category: 'Mercado' },
  { pattern: '%assai%',           category: 'Mercado' },
  { pattern: '%hortifruti%',      category: 'Mercado' },
  { pattern: '%supermercado%',    category: 'Mercado' },
  { pattern: '%mercadinho%',      category: 'Mercado' },
  { pattern: '%padaria%',         category: 'Mercado' },
  // ── Delivery (apps de comida; antes de Alimentação/Transporte p/ ganhar o match) ─
  { pattern: 'ifd*%',             category: 'Delivery' },
  { pattern: '%ifood%',           category: 'Delivery' },
  { pattern: '%rappi%',           category: 'Delivery' },
  { pattern: '%uber eats%',       category: 'Delivery' },
  { pattern: '%james delivery%',  category: 'Delivery' },
  // ── Alimentação ──────────────────────────────────────────────────────────────
  { pattern: '%mcdonalds%',       category: 'Alimentação' },
  { pattern: '%mc donalds%',      category: 'Alimentação' },
  { pattern: '%burger king%',     category: 'Alimentação' },
  { pattern: '%subway%',          category: 'Alimentação' },
  { pattern: '%outback%',         category: 'Alimentação' },
  { pattern: "%bob's%",           category: 'Alimentação' },
  { pattern: "%habib's%",         category: 'Alimentação' },
  { pattern: '%starbucks%',       category: 'Alimentação' },
  { pattern: '%pizz%',            category: 'Alimentação' },
  { pattern: '%sushi%',           category: 'Alimentação' },
  { pattern: '%temaki%',          category: 'Alimentação' },
  { pattern: '%restaurante%',     category: 'Alimentação' },
  { pattern: '%lanchonete%',      category: 'Alimentação' },
  // ── Transporte ───────────────────────────────────────────────────────────────
  { pattern: '%uber%',            category: 'Transporte' },
  { pattern: '%99app%',           category: 'Transporte' },
  { pattern: '%99 pay%',          category: 'Transporte' },
  { pattern: '%cabify%',          category: 'Transporte' },
  { pattern: '%buser%',           category: 'Transporte' },
  { pattern: '%sptrans%',         category: 'Transporte' },
  { pattern: '%bilhete unico%',   category: 'Transporte' },
  { pattern: '%estacionamento%',  category: 'Transporte' },
  { pattern: '%shell%',           category: 'Transporte' },
  { pattern: '%ipiranga%',        category: 'Transporte' },
  { pattern: '%posto%',           category: 'Transporte' },
  { pattern: '%combustivel%',     category: 'Transporte' },
  { pattern: '%combustível%',     category: 'Transporte' },
  // ── Streaming/Entretenimento ─────────────────────────────────────────────────
  { pattern: '%netflix%',         category: 'Streaming/Entretenimento' },
  { pattern: '%spotify%',         category: 'Streaming/Entretenimento' },
  { pattern: '%amazon prime%',    category: 'Streaming/Entretenimento' },
  { pattern: '%amazon video%',    category: 'Streaming/Entretenimento' },
  { pattern: '%disney%',          category: 'Streaming/Entretenimento' },
  { pattern: '%melimais%',        category: 'Streaming/Entretenimento' }, // Disney+ via Mercado Livre Mais
  { pattern: '%hbo max%',         category: 'Streaming/Entretenimento' },
  { pattern: '%globoplay%',       category: 'Streaming/Entretenimento' },
  { pattern: '%patreon%',         category: 'Streaming/Entretenimento' },
  { pattern: '%teledipity%',      category: 'Streaming/Entretenimento' },
  // ── Ferramentas ──────────────────────────────────────────────────────────────
  { pattern: '%claude%',          category: 'Ferramentas' },
  { pattern: '%anthropic%',       category: 'Ferramentas' },
  { pattern: '%openai%',          category: 'Ferramentas' },
  { pattern: '%chatgpt%',         category: 'Ferramentas' },
  { pattern: '%canva%',           category: 'Ferramentas' },
  { pattern: '%adobe%',           category: 'Ferramentas' },
  { pattern: '%microsoft%',       category: 'Ferramentas' },
  // ── Armazenamento ────────────────────────────────────────────────────────────
  { pattern: '%google one%',      category: 'Armazenamento' },
  { pattern: '%google storage%',  category: 'Armazenamento' },
  { pattern: '%icloud%',          category: 'Armazenamento' },
  // ── Jogos ────────────────────────────────────────────────────────────────────
  { pattern: '%playstation%',     category: 'Jogos' },
  { pattern: '%nintendo%',        category: 'Jogos' },
  { pattern: '%xbox%',            category: 'Jogos' },
  { pattern: '%steamgames%',      category: 'Jogos' },
  { pattern: '%supercell%',       category: 'Jogos' }, // Brawl Stars, Clash etc.
  { pattern: '%riot games%',      category: 'Jogos' },
  { pattern: '%epic games%',      category: 'Jogos' },
  { pattern: '%garena%',          category: 'Jogos' },
  { pattern: '%roblox%',          category: 'Jogos' },
  { pattern: '%activision%',      category: 'Jogos' },
  { pattern: '%blizzard%',        category: 'Jogos' },
  // ── Fitness ──────────────────────────────────────────────────────────────────
  { pattern: '%wellhub%',         category: 'Fitness' },
  { pattern: '%gympass%',         category: 'Fitness' },
  { pattern: '%smart fit%',       category: 'Fitness' },
  { pattern: '%academia%',        category: 'Fitness' },
  // ── Celular ──────────────────────────────────────────────────────────────────
  { pattern: '%tim*%',            category: 'Celular' }, // "Tim*Tim", "Tim*35991942769"
  { pattern: '%tim s a%',         category: 'Celular' }, // "Transferência enviada|TIM S A"
  { pattern: '%nucel%',           category: 'Celular' },
  { pattern: '%claro %',          category: 'Celular' },
  { pattern: '%vivo %',           category: 'Celular' },
  // apple.com/bill fica sem regra automática: mistura iCloud/Music/apps → categorize manual
  // ── Saúde ────────────────────────────────────────────────────────────────────
  { pattern: '%farmacia%',        category: 'Saúde' },
  { pattern: '%farmácia%',        category: 'Saúde' },
  { pattern: '%drogaria%',        category: 'Saúde' },
  { pattern: '%droga%',           category: 'Saúde' },
  { pattern: '%ultrafarma%',      category: 'Saúde' },
  { pattern: '%laboratorio%',     category: 'Saúde' },
  { pattern: '%laboratório%',     category: 'Saúde' },
  { pattern: '%clinica%',         category: 'Saúde' },
  { pattern: '%clínica%',         category: 'Saúde' },
  { pattern: '%hospital%',        category: 'Saúde' },
  { pattern: '%plano de saude%',  category: 'Saúde' },
  // ── Moradia ──────────────────────────────────────────────────────────────────
  { pattern: '%aluguel%',         category: 'Moradia' },
  { pattern: '%condominio%',      category: 'Moradia' },
  { pattern: '%condomínio%',      category: 'Moradia' },
  { pattern: '%copel%',           category: 'Moradia' },
  { pattern: '%cemig%',           category: 'Moradia' },
  { pattern: '%enel%',            category: 'Moradia' },
  { pattern: '%light energia%',   category: 'Moradia' },
  { pattern: '%sabesp%',          category: 'Moradia' },
  { pattern: '%embasa%',          category: 'Moradia' },
  { pattern: '%comgas%',          category: 'Moradia' },
  { pattern: '%claro%',           category: 'Moradia' },
  { pattern: '%vivo%',            category: 'Moradia' },
  { pattern: '%tim%',             category: 'Moradia' },
  { pattern: '%oi telecom%',      category: 'Moradia' },
  { pattern: '%net combo%',       category: 'Moradia' },
  // ── Educação ─────────────────────────────────────────────────────────────────
  { pattern: '%udemy%',           category: 'Educação' },
  { pattern: '%coursera%',        category: 'Educação' },
  { pattern: '%duolingo%',        category: 'Educação' },
  { pattern: '%escola%',          category: 'Educação' },
  { pattern: '%faculdade%',       category: 'Educação' },
  { pattern: '%universidade%',    category: 'Educação' },
  // ── Roupas ───────────────────────────────────────────────────────────────────
  { pattern: '%zara%',            category: 'Roupas' },
  { pattern: '%riachuelo%',       category: 'Roupas' },
  { pattern: '%renner%',          category: 'Roupas' },
  { pattern: '%c&a%',             category: 'Roupas' },
  { pattern: '%shein%',           category: 'Roupas' },
  { pattern: '%hering%',          category: 'Roupas' },
  { pattern: '%forever 21%',      category: 'Roupas' },
  // ── Compras online ───────────────────────────────────────────────────────────
  // Depois de Streaming/Entretenimento de propósito: Amazon Prime / Amazon Video
  // ganham antes e continuam em "Streaming/Entretenimento" (primeiro match vence).
  { pattern: '%mercado livre%',   category: 'Compras online' },
  { pattern: '%mercadolivre%',    category: 'Compras online' },
  { pattern: '%ebazar%',          category: 'Compras online' }, // descritor do Mercado Livre
  { pattern: '%shopee%',          category: 'Compras online' },
  { pattern: '%amazon%',          category: 'Compras online' },
  { pattern: '%amzn%',            category: 'Compras online' },
  { pattern: '%olx%',             category: 'Compras online' },
]

// Mapeamento Pluggy category → nome da nossa categoria
const PLUGGY_MAP: Record<string, string> = {
  // ── Pluggy em INGLÊS (é o que a API realmente retorna) ──────────────────────
  'Groceries': 'Mercado',
  'Eating out': 'Alimentação', 'Food delivery': 'Delivery',
  'Public transportation': 'Transporte', 'Gas stations': 'Transporte', 'Parking': 'Transporte',
  'Vehicle maintenance': 'Transporte', 'Car rental': 'Transporte', 'Taxi and ride sharing': 'Transporte',
  'Healthcare': 'Saúde', 'Pharmacy': 'Saúde', 'Hospital clinics and labs': 'Saúde',
  'Electricity': 'Moradia', 'Telecommunications': 'Moradia', 'Mobile': 'Celular',
  'Housing': 'Moradia', 'Accomodation': 'Moradia', 'Water': 'Moradia', 'Gas': 'Moradia',
  'Digital services': 'Streaming/Entretenimento', 'Video streaming': 'Streaming/Entretenimento', 'Music': 'Streaming/Entretenimento',
  'Education': 'Educação', 'Bookstore': 'Educação',
  'Clothing': 'Roupas',
  'Gaming': 'Lazer', 'Cinema, theater and concerts': 'Lazer', 'Sports goods': 'Lazer',
  'Travel': 'Lazer', 'Tickets': 'Lazer', 'Airport and airlines': 'Lazer', 'Gambling': 'Lazer',
  'Shopping': 'Outros', 'Online shopping': 'Compras online', 'Houseware': 'Outros',
  'Office supplies': 'Outros', 'Electronics': 'Outros', 'Pet supplies and vet': 'Outros',
  'Kids and toys': 'Outros', 'Services': 'Outros', 'Donations': 'Outros',
  'Tax on financial operations': 'Outros', 'Bank fees': 'Outros',
  // ── Investimento / Transferências (Pluggy em inglês) ─────────────────────────
  'Investments': 'Investimento', 'Investment': 'Investimento',
  'Fixed income': 'Investimento', 'Variable income': 'Investimento',
  'Transfers': 'Transferências', 'Wire transfer': 'Transferências',
  'Pix': 'Transferências', 'Same person transfer': 'Transferências',
  'Transfer - different person': 'Transferências',
  // ── Pluggy em português (fallback) ──────────────────────────────────────────
  // Mercado
  'Supermercados': 'Mercado',
  'Supermercado': 'Mercado',
  // Alimentação
  'Alimentação e Restaurantes': 'Alimentação',
  'Restaurantes': 'Alimentação',
  'Delivery': 'Delivery',
  'Fast Food': 'Alimentação',
  'Padaria': 'Alimentação',
  // Transporte
  'Transporte': 'Transporte',
  'Transporte Público': 'Transporte',
  'Combustível': 'Transporte',
  'Aplicativos de Transporte': 'Transporte',
  'Estacionamento': 'Transporte',
  // Saúde
  'Saúde': 'Saúde',
  'Farmácia': 'Saúde',
  'Médico e Hospitais': 'Saúde',
  'Plano de Saúde': 'Saúde',
  // Lazer
  'Lazer': 'Lazer',
  'Entretenimento': 'Lazer',
  'Viagem': 'Lazer',
  'Esporte': 'Lazer',
  'Cultura': 'Lazer',
  // Streaming/Entretenimento e afins
  'Assinaturas e Serviços': 'Streaming/Entretenimento',
  'Assinaturas': 'Streaming/Entretenimento',
  'Streaming': 'Streaming/Entretenimento',
  'Telecomunicações': 'Celular',
  'Internet': 'Moradia',
  // Educação
  'Educação': 'Educação',
  'Cursos e Treinamentos': 'Educação',
  'Papelaria': 'Educação',
  // Moradia
  'Moradia': 'Moradia',
  'Aluguel': 'Moradia',
  'Condomínio': 'Moradia',
  'Contas de Consumo': 'Moradia',
  'Casa e Decoração': 'Moradia',
  // Roupas
  'Roupas e Acessórios': 'Roupas',
  'Vestuário': 'Roupas',
  // Investimento / Transferências (Pluggy em português)
  'Transferências': 'Transferências',
  'Transferência': 'Transferências',
  'Investimentos': 'Investimento',
  'Investimento': 'Investimento',
  // Outros
  'Serviços Financeiros': 'Outros',
  'Impostos e Taxas': 'Outros',
  'Outros': 'Outros',
}

/**
 * Investimento não é consumo nem renda: é patrimônio mudando de lugar.
 * Marca TODAS as transações da categoria Investimento como is_transfer
 * (não-gasto/não-renda) — somem da fila, dos gastos, das entradas e do acerto.
 * Saídas = aporte; entradas = resgate/rendimento (dinheiro voltando da carteira).
 * Idempotente: chame no sync e depois de categorizar manualmente.
 * Reversível por transação pelo botão "⇄".
 */
export async function markInvestmentsAsTransfer(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: cat } = await supabase
    .from('categories')
    .select('id')
    .eq('name', 'Investimento')
    .maybeSingle()
  if (!cat) return

  await supabase
    .from('transactions')
    .update({ is_transfer: true })
    .eq('user_id', userId)
    .eq('category_id', cat.id)
    .eq('is_transfer', false)
}

/**
 * IOF de compra internacional: o imposto vem como uma transação SEPARADA, na
 * mesma conta da compra, logo depois dela (no Nubank, em geral no dia seguinte).
 *
 * CATEGORIA: todo IOF vai pra categoria "IOF" — imposto é imposto, não é a
 * compra que o gerou. Vale pra TODO IOF, inclusive os que ficaram com a
 * categoria da compra de quando o IOF herdava ela, e o estorno ("IOF de volta
 * de…"). Editar a categoria de um IOF não vira regra (isIofDesc em actions.ts),
 * então o próximo sync devolve ele pra "IOF".
 *
 * DIVISÃO: segue fielmente a compra atrelada — uma compra internacional 100% da
 * pessoa 2 leva o IOF 100% pessoa 2 também. Quem pagou já é o mesmo, pois é a
 * mesma conta. O pareamento está em pairIofSplits (iof.ts).
 *
 * Idempotente. Roda DEPOIS de applySplitRules, quando a compra já tem divisão
 * final.
 */
export async function linkIofToPurchase(
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('user_id', userId)
  const accountType = new Map((accounts ?? []).map((a) => [a.id, a.type]))

  // ── Categoria: todo IOF vai pra "IOF" ─────────────────────────────────────
  const { data: iofCat } = await supabase
    .from('categories')
    .select('id')
    .eq('name', 'IOF')
    .maybeSingle()

  if (iofCat) {
    // ILIKE não tem limite de palavra ("%iof%" casaria "Biofarma"): ele só
    // estreita a busca, e o \biof\b no JS decide.
    const { data: foraDoLugar } = await supabase
      .from('transactions')
      .select('id, description')
      .eq('user_id', userId)
      .ilike('description', '%iof%')
      .or(`category_id.is.null,category_id.neq.${iofCat.id}`)
      .limit(PG_MAX_ROWS)
    const ids = (foraDoLugar ?? []).filter((t) => isIof(t.description)).map((t) => t.id)
    for (let i = 0; i < ids.length; i += 100) {
      await supabase
        .from('transactions')
        .update({ category_id: iofCat.id })
        .in('id', ids.slice(i, i + 100))
    }
  }

  // od = raw->>date (horário do lançamento, p/ ordenar dentro do dia);
  // cur = raw->>currencyCode (moeda da compra: USD/EUR… é a que gera IOF)
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, account_id, transaction_date, description, category_id, split_mine_pct, created_at, amount_cents, od:raw->>date, cur:raw->>currencyCode')
    .eq('user_id', userId)
    .eq('is_manual', false)
    .lt('amount_cents', 0)
    // O pareamento olha no máximo 3 dias pra trás, então as mais recentes
    // bastam. O `.order` é o que garante que a fatia seja sempre essa — sem
    // ele, o teto de 1000 devolveria 1000 linhas quaisquer.
    .order('transaction_date', { ascending: false })
    .limit(PG_MAX_ROWS)
  if (!txs || txs.length === 0) return

  // Só age em IOF de compra internacional: ou a descrição diz "internacional/
  // exterior", ou está num cartão de crédito (onde todo IOF é de compra externa).
  const isIntlMarker = (d: string | null) =>
    /(internac|exterior|estrangeira)/i.test(d ?? '')
  const updates = pairIofSplits(
    txs as IofTx[],
    (t) => isIntlMarker(t.description) || accountType.get(t.account_id) === 'credit',
  )

  for (const u of updates) {
    await supabase
      .from('transactions')
      .update({ split_mine_pct: u.split_mine_pct })
      .eq('id', u.id)
  }
}

/**
 * Aplica regras do usuário, padrões de descrição e mapeamento Pluggy
 * a transações sem categoria.
 * Chame após o upsert de transações no sync.
 */
export async function applyCategoryRules(
  userId: string,
  supabase: SupabaseClient,
  index?: DescIndex,
): Promise<void> {
  // Busca todas as categorias uma vez
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')

  if (!categories || categories.length === 0) return

  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))

  // Uma leitura das transações serve aos três passos abaixo. `stage` também
  // escreve no índice, então o guard "só onde category_id é null" continua
  // valendo entre passos — quem categoriza primeiro ganha, como antes.
  const idx = index ?? (await loadDescIndex(supabase, userId))
  const pending = newPending()

  // 1. Regras do usuário (exact match, maior prioridade)
  const { data: rules } = await supabase
    .from('category_rules')
    .select('description_pattern, category_id')
    .eq('user_id', userId)

  for (const rule of rules ?? []) {
    // casa por descrição normalizada (ignora maiúsculas/sufixo/CNPJ);
    // só preenche onde ainda não há categoria
    stage(pending, matchRows(idx, rule.description_pattern, 'category_id'), {
      category_id: rule.category_id,
    })
  }

  // 2. Padrões de descrição pré-definidos (ILIKE, só em transações ainda sem categoria)
  for (const { pattern, category } of DESCRIPTION_PATTERNS) {
    const catId = catByName.get(category.toLowerCase())
    if (!catId) continue
    stage(pending, matchIlike(idx, pattern, 'category_id'), { category_id: catId })
  }

  // 3. Mapeamento Pluggy: transações sem categoria que têm raw.category.
  // Traz só `raw->>category`, não o `raw` inteiro (o payload cru da Pluggy tem
  // uns 2 KB por linha). O "sem categoria" é filtrado pelo índice, que já sabe
  // o que os passos 1 e 2 preencheram — o banco ainda não.
  const comCatPluggy = await fetchAllPages<{ id: string; pluggyCat: string | null }>((from, to) =>
    supabase
      .from('transactions')
      .select('id, pluggyCat:raw->>category')
      .eq('user_id', userId)
      .not('raw->category', 'is', null)
      .order('id', { ascending: true })
      .range(from, to),
  )

  for (const t of comCatPluggy) {
    if (!t.pluggyCat) continue
    const ourCatName = PLUGGY_MAP[t.pluggyCat]
    if (!ourCatName) continue
    const catId = catByName.get(ourCatName.toLowerCase())
    if (!catId) continue
    const row = idx.byId.get(t.id)
    if (!row || row.category_id !== null) continue
    stage(pending, [row], { category_id: catId })
  }

  await flushPatches(supabase, userId, pending)
}
