/**
 * Laudo financeiro — as contas que a aba /dashboard/laudo mostra.
 *
 * Lógica pura, sem Supabase: recebe os gastos do período e devolve os cortes.
 * Existe separado porque cada um desses números já foi contestado uma vez, e
 * número contestado precisa de teste.
 *
 * Vocabulário (o mesmo do resto do app — ver gastos.ts):
 *   recorrente     conta fixa marcada; não é escolha do mês
 *   extraordinário compra única >= R$ 3.000 que não é recorrente; fica FORA do teto
 *   rotina         o resto
 */
import { EXTRAORDINARIO_CENTS } from './gastos.ts'

export interface LaudoTx {
  transaction_date: string
  description: string | null
  note: string | null
  amount_cents: number
  split_mine_pct: number | null
  is_fixed: boolean | null
  fixed_bill_id: string | null
  installment_number?: number | null
  total_installments?: number | null
  categoria: string
}

export type Dono = 'juntos' | 'nat' | 'jen' | 'sem'

/** De quem é o gasto, pela divisão. 100 = só pessoa 1, 0 = só pessoa 2. */
export function donoDe(t: Pick<LaudoTx, 'split_mine_pct'>): Dono {
  const s = t.split_mine_pct
  if (s === null || s === undefined) return 'sem'
  if (s === 100) return 'nat'
  if (s === 0) return 'jen'
  return 'juntos'
}

export const ehRecorrente = (t: Pick<LaudoTx, 'is_fixed' | 'fixed_bill_id'>) =>
  !!(t.is_fixed || t.fixed_bill_id)

export function baldeDoLaudo(t: LaudoTx): 'recorrente' | 'extraordinario' | 'rotina' {
  if (ehRecorrente(t)) return 'recorrente'
  return Math.abs(t.amount_cents) >= EXTRAORDINARIO_CENTS ? 'extraordinario' : 'rotina'
}

/* ─────────────────────────── mês a mês ─────────────────────────── */

export interface MesDoLaudo {
  mes: string
  recorrente: number
  rotina: number
  extraordinario: number
  /** recorrente + rotina: é isto que o teto controla. */
  noTeto: number
  porDono: Record<Dono, number>
}

export function porMes(txs: LaudoTx[]): MesDoLaudo[] {
  const mapa = new Map<string, MesDoLaudo>()
  for (const t of txs) {
    const mes = t.transaction_date.slice(0, 7)
    let m = mapa.get(mes)
    if (!m) {
      m = { mes, recorrente: 0, rotina: 0, extraordinario: 0, noTeto: 0, porDono: { juntos: 0, nat: 0, jen: 0, sem: 0 } }
      mapa.set(mes, m)
    }
    const v = Math.abs(t.amount_cents)
    m[baldeDoLaudo(t)] += v
    m.noTeto = m.recorrente + m.rotina
    m.porDono[donoDe(t)] += v
  }
  return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

/** Mediana de uma lista. Lista vazia devolve 0. */
export function mediana(vals: number[]): number {
  if (vals.length === 0) return 0
  const v = [...vals].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2)
}

/* ────────────────────── fora da curva ────────────────────── */

export interface ForaDaCurva {
  tx: LaudoTx
  /** Mediana da categoria dele. */
  tipico: number
  /** Quantas vezes acima do típico. */
  vezes: number
}

/** Piso: abaixo disso é ruído de categoria pequena, não anomalia. */
export const PISO_OUTLIER_CENTS = 50_000
/** Desvios medianos absolutos a partir dos quais o gasto é anômalo. */
export const DESVIOS_OUTLIER = 6

/**
 * Gasto alto PRA A PRÓPRIA CATEGORIA. Aluguel de R$ 6.578 todo mês não é
 * anomalia; restaurante de R$ 737 é. Usa mediana + desvio absoluto mediano, que
 * não se distorce justamente pelos outliers que se está procurando.
 *
 * Categoria com menos de 4 gastos fica de fora: não há base pra dizer o que é
 * típico. Recorrentes entram na conta, mas quem chama pode filtrar — eles são
 * grandes por natureza e já esperados.
 */
export function foraDaCurva(txs: LaudoTx[]): ForaDaCurva[] {
  const porCat = new Map<string, number[]>()
  for (const t of txs) {
    const arr = porCat.get(t.categoria)
    if (arr) arr.push(Math.abs(t.amount_cents))
    else porCat.set(t.categoria, [Math.abs(t.amount_cents)])
  }

  const out: ForaDaCurva[] = []
  for (const t of txs) {
    const vs = porCat.get(t.categoria)!
    if (vs.length < 4) continue
    const v = Math.abs(t.amount_cents)
    if (v < PISO_OUTLIER_CENTS) continue
    const med = mediana(vs)
    const mad = mediana(vs.map((x) => Math.abs(x - med))) || 1
    const z = (0.6745 * (v - med)) / mad
    if (z >= DESVIOS_OUTLIER) out.push({ tx: t, tipico: med, vezes: med > 0 ? v / med : 0 })
  }
  return out.sort((a, b) => Math.abs(b.tx.amount_cents) - Math.abs(a.tx.amount_cents))
}

/* ────────────────── parcelas ainda em aberto ────────────────── */

export interface ParcelaAberta {
  nome: string
  categoria: string
  dono: Dono
  posicao: number
  total: number
  valorMes: number
  faltam: number
  aPagar: number
  ultimaData: string
}

const lojaDoPlano = (t: LaudoTx) =>
  (t.description ?? '')
    .replace(/\s*\d+\/\d+\s*$/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

/**
 * Duas parcelas são da MESMA compra quando o valor é praticamente igual.
 *
 * "Praticamente" porque a operadora arredonda: a LATAM cobrou R$ 2.466,51 na
 * primeira e R$ 2.466,49 nas outras três. Arredondar pra reais não resolve —
 * esses dois centavos caem em reais diferentes, e a compra quitada aparecia com
 * três parcelas em aberto. A tolerância é o maior entre R$ 1,00 e 1% do valor:
 * cobre o arredondamento sem juntar R$ 546,03 com R$ 411,75, que são compras
 * distintas da mesma loja.
 */
function mesmoValor(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(100, Math.min(a, b) * 0.01)
}

/**
 * O que ainda vai cair de compra parcelada. É o número que faltava pra combinar
 * o teto: parcela é decisão do passado que chega no futuro, e nada no app
 * mostrava isso.
 */
export function parcelasAbertas(txs: LaudoTx[]): ParcelaAberta[] {
  // agrupa por (loja, nº de parcelas) e, dentro disso, por valor com tolerância
  const porLoja = new Map<string, { valor: number; ns: Set<number>; ultima: LaudoTx }[]>()
  for (const t of txs) {
    const n = t.total_installments
    const i = t.installment_number
    if (!n || n <= 1 || !i) continue
    const k = `${lojaDoPlano(t)}|${n}`
    const v = Math.abs(t.amount_cents)
    const lista = porLoja.get(k) ?? []
    const plano = lista.find((p) => mesmoValor(p.valor, v))
    if (plano) {
      plano.ns.add(i)
      if (t.transaction_date > plano.ultima.transaction_date) plano.ultima = t
    } else {
      lista.push({ valor: v, ns: new Set([i]), ultima: t })
    }
    porLoja.set(k, lista)
  }

  const out: ParcelaAberta[] = []
  for (const { ns, ultima } of [...porLoja.values()].flat()) {
    const posicao = Math.max(...ns)
    const total = ultima.total_installments!
    const faltam = total - posicao
    if (faltam <= 0) continue
    const valorMes = Math.abs(ultima.amount_cents)
    out.push({
      nome: nomeCurto(ultima).replace(/\s*\d+\/\d+\s*$/, '').trim(),
      categoria: ultima.categoria,
      dono: donoDe(ultima),
      posicao,
      total,
      valorMes,
      faltam,
      aPagar: faltam * valorMes,
      ultimaData: ultima.transaction_date,
    })
  }
  return out.sort((a, b) => b.aPagar - a.aPagar)
}

/** Quanto de parcela cai em cada mês a partir de `desdeMes` ('YYYY-MM'). */
export function cronogramaParcelas(abertas: ParcelaAberta[], desdeMes: string): { mes: string; total: number }[] {
  const mapa = new Map<string, number>()
  for (const p of abertas) {
    const [y, m] = p.ultimaData.slice(0, 7).split('-').map(Number)
    for (let k = 1; k <= p.faltam; k++) {
      const mm = m + k
      const ano = y + Math.floor((mm - 1) / 12)
      const mes = ((mm - 1) % 12) + 1
      const chave = `${ano}-${String(mes).padStart(2, '0')}`
      if (chave < desdeMes) continue
      mapa.set(chave, (mapa.get(chave) ?? 0) + p.valorMes)
    }
  }
  return [...mapa.entries()].map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))
}

/* ───────────────────────── nome legível ───────────────────────── */

const DESC_GENERICA = ['transferência', 'transferencia', 'pix ', 'pagamento', 'ted ']

/** Nome de exibição: a observação vence quando a descrição é genérica. */
export function nomeCurto(t: Pick<LaudoTx, 'description' | 'note'>): string {
  const d = (t.description ?? '').trim()
  const n = (t.note ?? '').trim()
  if (n && (!d || DESC_GENERICA.some((g) => d.toLowerCase().includes(g)))) return n
  if (d.includes('|')) return d.split('|').pop()!.trim()
  return d || n || 'sem nome'
}

/* ─────────────── as cinco naturezas de gasto ───────────────
 * Taxonomia do casal, não minha. A pergunta que ela responde não é "em que
 * categoria caiu" e sim "o quanto disso eu consigo mexer":
 *
 *   fixo         sempre vem, mesmo valor, inegociável — aluguel, luz, água,
 *                condomínio, internet
 *   quase fixo   vem todo mês mas dá pra renegociar e, no limite, cortar —
 *                diarista, piscineiro, jardineiro
 *   flexível     vem todo mês com valor diferente; é onde se economiza de
 *                verdade — mercado, comida, gatos, fitness, remédio
 *   parcelado    tem início, meio e fim; o que importa é quantas faltam
 *   assinatura   streaming e ferramentas; cortar é decisão de uma vez só
 *   variável     o resto: escolha pura, mês a mês
 */

export type Natureza = 'fixo' | 'quaseFixo' | 'flexivel' | 'parcelado' | 'assinatura' | 'variavel'

export const NATUREZA_LABEL: Record<Natureza, string> = {
  fixo: 'Fixo', quaseFixo: 'Quase fixo', flexivel: 'Flexível fixo',
  parcelado: 'Parcelado', assinatura: 'Assinaturas', variavel: 'Variável',
}

export const NATUREZA_NOTA: Record<Natureza, string> = {
  fixo: 'sempre vem, inegociável',
  quaseFixo: 'dá pra renegociar; cortar só em último caso',
  flexivel: 'muda todo mês — é aqui que se economiza',
  parcelado: 'tem fim; o que importa é quantas faltam',
  assinatura: 'cortar é decisão de uma vez só',
  variavel: 'escolha pura, mês a mês',
}

export const NATUREZAS: Natureza[] = ['fixo', 'quaseFixo', 'flexivel', 'parcelado', 'assinatura', 'variavel']

/**
 * Contas fixas cadastradas que são INEGOCIÁVEIS. O resto das contas fixas
 * (serviços e pessoas: diarista, piscineiro, jardineiro) é "quase fixo".
 *
 * Conta fixa nova cai em "quase fixo" por padrão — chamar algo de inegociável é
 * afirmação forte demais pra fazer por omissão.
 */
const CONTA_INEGOCIAVEL = ['aluguel', 'luz', 'agua', 'água', 'condominio', 'condomínio', 'internet', 'iptu', 'seguro']

/** Categorias que mudam todo mês mas não se pode simplesmente parar. */
const CATEGORIA_FLEXIVEL = new Set(['Mercado', 'Alimentação', 'Delivery', 'Gatos', 'Fitness', 'Saúde'])

/** Assinatura de verdade: cobra sozinha até alguém cancelar. */
const CATEGORIA_ASSINATURA = new Set(['Ferramentas', 'Streaming/Entretenimento', 'Armazenamento'])

export function naturezaDe(t: LaudoTx, nomeDaConta?: string): Natureza {
  // parcelado vem primeiro: móvel em 12x é parcelado, não "casa"
  if (t.total_installments && t.total_installments > 1) return 'parcelado'
  if (t.fixed_bill_id) {
    const n = (nomeDaConta ?? '').toLowerCase()
    return CONTA_INEGOCIAVEL.some((c) => n.includes(c)) ? 'fixo' : 'quaseFixo'
  }
  if (CATEGORIA_FLEXIVEL.has(t.categoria)) return 'flexivel'
  if (CATEGORIA_ASSINATURA.has(t.categoria)) return 'assinatura'
  return 'variavel'
}

export interface LinhaNatureza {
  natureza: Natureza
  porMes: number[]
  total: number
  /** Mediana dos meses fechados. */
  tipico: number
  /** O que tem dentro, do maior pro menor. */
  itens: { nome: string; total: number; tipico: number; meses: number }[]
}

/**
 * Matriz natureza × mês, com o detalhe de cada uma.
 * `nomeDaConta` traduz fixed_bill_id em nome, pra separar fixo de quase fixo.
 */
export function porNatureza(
  txs: LaudoTx[],
  meses: string[],
  nomeDaConta: Map<string, string>,
  mesEmCurso?: string,
): LinhaNatureza[] {
  const idx = new Map(meses.map((m, i) => [m, i]))
  const acc = new Map<Natureza, number[]>()
  const itens = new Map<Natureza, Map<string, Map<string, number>>>()
  for (const n of NATUREZAS) {
    acc.set(n, new Array(meses.length).fill(0))
    itens.set(n, new Map())
  }

  for (const t of txs) {
    const i = idx.get(t.transaction_date.slice(0, 7))
    if (i === undefined) continue
    const nat = naturezaDe(t, t.fixed_bill_id ? nomeDaConta.get(t.fixed_bill_id) : undefined)
    const v = Math.abs(t.amount_cents)
    acc.get(nat)![i] += v

    const nome = t.fixed_bill_id
      ? (nomeDaConta.get(t.fixed_bill_id) ?? 'conta fixa')
      : chaveDeComerciante(t)
    const porItem = itens.get(nat)!
    const mm = porItem.get(nome) ?? new Map<string, number>()
    const mes = t.transaction_date.slice(0, 7)
    mm.set(mes, (mm.get(mes) ?? 0) + v)
    porItem.set(nome, mm)
  }

  const fechados = meses.map((m, i) => (m === mesEmCurso ? -1 : i)).filter((i) => i >= 0)

  return NATUREZAS.map((natureza) => {
    const porMes = acc.get(natureza)!
    const lista = [...itens.get(natureza)!.entries()]
      .map(([nome, mm]) => ({
        nome,
        total: [...mm.values()].reduce((s, v) => s + v, 0),
        tipico: mediana([...mm.values()]),
        meses: mm.size,
      }))
      .sort((a, b) => b.total - a.total)
    return {
      natureza,
      porMes,
      total: porMes.reduce((s, v) => s + v, 0),
      tipico: mediana(fechados.map((i) => porMes[i])),
      itens: lista,
    }
  }).filter((l) => l.total > 0)
}

/* ─────────────── o piso invisível: compromisso que não é conta fixa ───────────────
 * Conta fixa cadastrada aparece no card de contas a pagar e entra no balde
 * `recorrente`. Mas existe um monte de cobrança que se repete todo mês e NÃO está
 * cadastrada: assinatura, terapeuta, plano de celular, plano do gato. O app joga
 * tudo isso em `rotina` — que é justamente o balde que o casal corta quando
 * aperta. É piso disfarçado de escolha.
 *
 * Foi assim que a assistente da pessoa 2 passou oito meses somando R$ 1.400/mês
 * dentro da rotina sem ninguém perceber.
 */

/** Em quantos meses distintos precisa cobrar pra ser considerado mensal. */
export const MESES_PRA_SER_MENSAL = 5

/**
 * Categorias onde repetir NÃO é compromisso: mercado, restaurante e iFood
 * aparecem todo mês porque a vida acontece, não porque alguém assinou algo. Uma
 * cobrança só é "compromisso" quando ela vem sozinha.
 */
const CATEGORIA_DE_HABITO = new Set(['Mercado', 'Alimentação', 'Delivery', 'Transporte', 'Compras online'])

export interface Compromisso {
  nome: string
  categoria: string
  dono: Dono
  /** Em quantos meses distintos apareceu. */
  meses: number
  /** Mediana do total mensal. */
  porMes: number
  total: number
  ultimoMes: string
  /** Ainda cobrou no mês passado ou neste? */
  ativo: boolean
}

/**
 * Junta grafias do mesmo estabelecimento. A maquininha manda o nome de um jeito
 * diferente a cada mês ("Ebn *Adobe", "Adobe *Adobe", "EBN*ADOBE"), e sem juntar
 * a cobrança mensal parece uma compra avulsa diferente a cada vez.
 */
export function chaveDeComerciante(t: Pick<LaudoTx, 'description' | 'note'>): string {
  const bruto = `${t.description ?? ''} ${t.note ?? ''}`.toLowerCase()
  const marcas: [string, string][] = [
    ['adobe', 'Adobe'], ['apple', 'Apple'], ['icloud', 'Apple'], ['netflix', 'Netflix'],
    ['spotify', 'Spotify'], ['wellhub', 'Wellhub'], ['gympass', 'Wellhub'], ['google', 'Google One'],
    ['claude', 'Claude'], ['anthropic', 'Claude'], ['chatgpt', 'ChatGPT'], ['openai', 'ChatGPT'],
    ['disney', 'Disney+'], ['playstation', 'PlayStation'], ['prime', 'Amazon Prime'],
    ['kindle', 'Amazon Kindle'], ['melimais', 'Meli+'], ['patreon', 'Patreon'], ['udemy', 'Udemy'],
    ['shopify', 'Shopify'], ['nucel', 'NuCel'], ['dropout', 'Dropout'], ['goperl', 'GoPerl'],
  ]
  for (const [chave, nome] of marcas) if (bruto.includes(chave)) return nome

  let nome = nomeCurto(t).replace(/\s*\d+\/\d+\s*$/, '').trim()
  // caixa alta antes de comparar: "Minuto Pa-2215" e "MINUTO PA-2215" são a mesma loja
  nome = nome.replace(/\s+/g, ' ').toUpperCase().slice(0, 26)
  return nome ? nome.charAt(0) + nome.slice(1).toLowerCase() : 'sem nome'
}

/**
 * Cobranças que se repetem mês a mês e não têm conta fixa cadastrada.
 * `mesAtual` decide o que ainda está ativo (cobrou no mês passado ou neste).
 */
export function compromissosMensais(txs: LaudoTx[], mesAtual: string): Compromisso[] {
  const mesAnterior = (() => {
    const [y, m] = mesAtual.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  })()

  const acc = new Map<string, { porMes: Map<string, number>; cats: Map<string, number>; donos: Map<Dono, number>; ex: LaudoTx }>()
  for (const t of txs) {
    // conta fixa já aparece em outro lugar; parcela tem fim, não é compromisso mensal
    if (t.fixed_bill_id || (t.total_installments && t.total_installments > 1)) continue
    if (CATEGORIA_DE_HABITO.has(t.categoria)) continue
    const k = chaveDeComerciante(t)
    const mes = t.transaction_date.slice(0, 7)
    const v = Math.abs(t.amount_cents)
    let a = acc.get(k)
    if (!a) { a = { porMes: new Map(), cats: new Map(), donos: new Map(), ex: t }; acc.set(k, a) }
    a.porMes.set(mes, (a.porMes.get(mes) ?? 0) + v)
    a.cats.set(t.categoria, (a.cats.get(t.categoria) ?? 0) + 1)
    const d = donoDe(t)
    a.donos.set(d, (a.donos.get(d) ?? 0) + 1)
  }

  const maisComum = <T,>(m: Map<T, number>): T => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const out: Compromisso[] = []
  for (const [nome, a] of acc) {
    if (a.porMes.size < MESES_PRA_SER_MENSAL) continue
    const ultimoMes = [...a.porMes.keys()].sort().pop()!
    out.push({
      nome,
      categoria: maisComum(a.cats),
      dono: maisComum(a.donos),
      meses: a.porMes.size,
      porMes: mediana([...a.porMes.values()]),
      total: [...a.porMes.values()].reduce((s, v) => s + v, 0),
      ultimoMes,
      ativo: ultimoMes >= mesAnterior,
    })
  }
  return out.sort((a, b) => b.porMes - a.porMes)
}
