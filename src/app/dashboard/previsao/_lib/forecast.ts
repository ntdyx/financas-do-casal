// src/app/dashboard/previsao/_lib/forecast.ts
import { separaGastos, type GastoTx } from '../../../../lib/gastos.ts'

export interface HistTx extends GastoTx {
  transaction_date: string // 'YYYY-MM-DD'
}

const ymOf = (iso: string) => iso.slice(0, 7)

/**
 * Meses que servem de base pro baseline: os ja fechados do ano corrente
 * (exclui o mes em curso). Em janeiro/fevereiro/marco isso da 0, 1 ou 2 meses
 * — pouco demais pra tirar mediana, e em JANEIRO daria zero, zerando o
 * baseline. Por isso completa com os meses do ano anterior ate ter `minimo`.
 *
 * Devolve 'YYYY-MM' em ordem crescente.
 */
export function mesesBase(now: Date, minimo = 3): string[] {
  const fechadosNoAno = now.getMonth() // jan -> 0 fechados, ago -> 7 fechados
  const n = Math.max(fechadosNoAno, minimo)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    // mes anterior, depois o retrasado... o Date rola pro ano anterior sozinho
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out.reverse()
}

export interface Baseline { fixoTipico: number; rotinaTipica: number; mesesBase: number }

/** Mediana de uma lista de valores. Lista vazia -> 0. */
function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const v = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2)
}

/**
 * O mes "tipico" por MEDIANA, e so dos baldes que se repetem.
 *
 * `rotinaTipica` NAO inclui o extraordinario: um carro de 100 mil em julho nao
 * descreve nenhum mes real, e mesmo a mediana so o escondia — bastavam dois
 * meses com um evento cada pra ele voltar a envenenar o numero. Deixando o
 * extraordinario de fora por definicao, o tipico passa a descrever o que a casa
 * realmente faz todo mes.
 *
 * Mes fechado sem gasto entra como zero (e informacao, nao ausencia de dado).
 */
export function baseline(txs: HistTx[], closedMonths: string[]): Baseline {
  const n = closedMonths.length
  if (n === 0) return { fixoTipico: 0, rotinaTipica: 0, mesesBase: 0 }
  const porMes = new Map<string, HistTx[]>()
  for (const m of closedMonths) porMes.set(m, [])
  for (const t of txs) porMes.get(ymOf(t.transaction_date))?.push(t)

  const meses = [...porMes.values()].map(separaGastos)
  return {
    fixoTipico: mediana(meses.map((m) => m.recorrente)),
    rotinaTipica: mediana(meses.map((m) => m.rotina)),
    mesesBase: n,
  }
}

export type Ritmo = 'acelerado' | 'no-ritmo' | 'devagar'
export interface Projecao {
  /** Rotina ja lancada no mes (nao inclui recorrente nem extraordinario). */
  correndo: number
  /** Como a rotina fecha o mes se o ritmo de hoje continuar. */
  projetadoFechar: number
  ritmo: Ritmo
  /** Compras unicas grandes ja feitas no mes — fora do teto, mostradas a parte. */
  extraordinario: number
}

/**
 * Projeta so a ROTINA pelos dias corridos do mes.
 *
 * O extraordinario nao e extrapolado nem somado: extrapolar uma compra unica
 * projeta uma catastrofe que nao vai acontecer (o carro ja foi comprado, nao se
 * repete toda semana), e soma-lo ao final so mistura de novo o que a separacao
 * em baldes acabou de separar. Ele sai por fora, na propria linha.
 *
 * `ritmo` compara com o habito (`rotinaTipica`) e responde "estou gastando mais
 * que o meu normal?". Quem responde "cabe no teto?" e a sobra prevista.
 */
export function projetaFatura(gastosMesAtual: HistTx[], now: Date, rotinaTipica: number): Projecao {
  const b = separaGastos(gastosMesAtual)
  const dia = now.getDate()
  const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  const projetadoFechar = dia > 0 ? Math.round((b.rotina / dia) * diasNoMes) : b.rotina
  let ritmo: Ritmo = 'no-ritmo'
  if (rotinaTipica > 0) {
    if (projetadoFechar > rotinaTipica * 1.1) ritmo = 'acelerado'
    else if (projetadoFechar < rotinaTipica * 0.9) ritmo = 'devagar'
  }
  return { correndo: b.rotina, projetadoFechar, ritmo, extraordinario: b.extraordinario }
}

/**
 * Quanto sobra do TETO se o mes fechar assim.
 *
 * Antes isto era `renda - gastos`, e a renda era a soma das entradas das contas
 * sincronizadas. Nao funcionava: metade do que entrava nao era renda (devolucao
 * de capital, resgate, dinheiro em transito) e a renda que era renda nem sempre
 * passa por aqui. O teto e um numero combinado entre as duas, que descreve
 * quanto a casa PODE gastar — e nao depende de adivinhar de onde vem o dinheiro.
 */
export function sobraPrevista(p: { teto: number; variavel: number; fixas: number; trombadoes: number }): number {
  return p.teto - (p.variavel + p.fixas + p.trombadoes)
}
