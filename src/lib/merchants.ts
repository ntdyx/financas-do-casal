/**
 * Nome amigável de comerciante para EXIBIÇÃO.
 *
 * Por que existe: a Pluggy entrega a descrição crua do banco/maquininha, que
 * vem truncada e barulhenta:
 *   - cartão:        "Amazon Servicos de Var", "Mercadolivre*Comamorde"
 *   - transferência: "Transferência enviada|PAGSEGURO TECNOLOGIA LTDA"
 * Aqui mapeamos as marcas conhecidas para um rótulo limpo, SÓ na exibição —
 * o dado gravado e o aprendizado (normalizeDesc/similarKey) continuam intactos.
 *
 * Importante: a Pluggy NÃO devolve nome melhor para cartão (`raw.merchant` vem
 * sempre vazio nesta conexão). Lojista obscuro que vem truncado continua cru —
 * não há de onde tirar o nome completo.
 */

// Marca conhecida → rótulo de exibição. A 1ª chave que casar vence;
// ponha as mais específicas antes (ex.: "uber eats" antes de "uber").
const BRAND_LABELS: Array<{ label: string; keys: string[] }> = [
  { label: 'Uber Eats',     keys: ['uber eats', 'ubereats'] },
  { label: 'Uber',          keys: ['uber'] },
  { label: 'iFood',         keys: ['ifood', 'ifd*', 'ifd '] },
  { label: 'Rappi',         keys: ['rappi'] },
  { label: 'Amazon Prime',  keys: ['amazon prime', 'amazonprime', 'prime video'] },
  { label: 'Amazon',        keys: ['amazon'] },
  { label: 'Mercado Livre', keys: ['mercadolivre', 'mercado livre', 'mercadolibre'] },
  { label: 'Mercado Pago',  keys: ['mercadopago', 'mercado pago'] },
  { label: 'Shopee',        keys: ['shopee'] },
  { label: 'Shein',         keys: ['shein'] },
  { label: 'AliExpress',    keys: ['aliexpress'] },
  { label: 'PayPal',        keys: ['paypal'] },
  { label: 'PagSeguro',     keys: ['pagseguro', 'pagbank', 'pag*'] },
  { label: 'Pagar.me',      keys: ['pagar me', 'pagar.me', 'pagarme'] },
  { label: 'Netflix',       keys: ['netflix'] },
  { label: 'Spotify',       keys: ['spotify'] },
  { label: 'Disney+',       keys: ['disney'] },
  { label: 'Apple',         keys: ['apple.com', 'apple bill', 'apple subscri', 'itunes'] },
  { label: 'Google',        keys: ['google'] },
  { label: 'Microsoft',     keys: ['microsoft'] },
  { label: 'Eventim',       keys: ['eventim'] },
  // ── Contas / boletos recorrentes (nome às vezes vem cru no boleto) ──────────
  { label: 'Enel',          keys: ['enel'] },
  { label: 'Sabesp',        keys: ['sabesp'] },
  { label: 'NMultifibra',   keys: ['nmultifibra', 'multifibra'] },
  { label: 'TIM',           keys: ['tim s a', 'tim s.a', 'tim sa', 'tim*'] },
  { label: 'Banco XP',      keys: ['banco xp'] },
]

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function matchBrand(text: string): string | null {
  const n = norm(text)
  for (const b of BRAND_LABELS) {
    if (b.keys.some((k) => n.includes(k))) return b.label
  }
  return null
}

/**
 * Nome amigável para EXIBIR. Casos:
 *  - "NOME do banco" depois de "|"  → se a marca é conhecida, mostra o rótulo
 *    limpo (PagSeguro); senão mantém a descrição como veio (ex.: nome de pessoa).
 *  - compra de cartão (sem "|")     → mapeia a marca e preserva a parcela "3/5";
 *    lojista desconhecido volta sem alteração (Pluggy não dá nome melhor).
 */
export function prettyName(description: string | null | undefined): string {
  const desc = (description || '').trim()
  if (!desc) return desc

  // transferências vêm como "Prefixo|NOME" — olha só a parte do nome
  if (desc.includes('|')) {
    const name = desc.slice(desc.lastIndexOf('|') + 1).trim()
    return matchBrand(name) ?? desc
  }

  // cartão/loja: separa o sufixo de parcela "x/y" pra reanexar depois
  const m = desc.match(/\s(\d{1,2}\/\d{1,2})\s*$/)
  const installment = m ? m[1] : null
  const core = m ? desc.slice(0, m.index).trim() : desc

  const brand = matchBrand(core)
  if (brand) return installment ? `${brand} ${installment}` : brand
  return desc
}
