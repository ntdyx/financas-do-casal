// src/app/dashboard/previsao/_lib/build-corridor.ts
// Autocontido: só imports relativos com .ts (roda no node --test).
import { baseline, projetaFatura, sobraPrevista, mesesBase, type Projecao, type HistTx } from './forecast.ts'
import { plannedForMonth, type PlannedBill, type PlannedHit } from './planned.ts'
import { capForMonth, type SpendCapRow } from '../../../../lib/spend-cap.ts'
import type { Settlement } from '../../../../lib/settlement.ts'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export interface MonthColumn {
  ym: string
  label: string
  isCurrent: boolean
  variavel: number
  fixas: number
  trombadoes: PlannedHit[]
  /** Teto combinado valendo neste mes. Null = ainda nao definiram nenhum. */
  teto: number | null
  /** Quanto sobra do teto. Null quando nao ha teto — sem regua nao ha resposta. */
  sobra: number | null
  projecao: Projecao | null
  settlement: Settlement | null
}

export interface CorridorInput {
  now: Date
  histTxs: HistTx[]
  mesAtualGastos: HistTx[]
  planned: PlannedBill[]
  /** Historico de tetos (spend_caps). O que vale em cada mes sai do effective_from. */
  caps: SpendCapRow[]
  settlementByYm?: Record<string, Settlement | null>
}

export function buildCorridor(input: CorridorInput): { columns: MonthColumn[]; resumo: { totalTrombadoes: number; mesApertadoYm: string | null } } {
  const closed = mesesBase(input.now)
  const b = baseline(input.histTxs, closed)

  const columns: MonthColumn[] = []
  let totalTrombadoes = 0
  for (let i = 0; i < 3; i++) {
    const d = new Date(input.now.getFullYear(), input.now.getMonth() + i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const isCurrent = i === 0
    const trombadoes = plannedForMonth(input.planned, ym)
    const tromTotal = trombadoes.reduce((s, h) => s + h.amount_cents, 0)
    totalTrombadoes += tromTotal
    const projecao = isCurrent ? projetaFatura(input.mesAtualGastos, input.now, b.rotinaTipica) : null
    // Mes corrente: o que importa e como ELE esta correndo, nao o habito — senao
    // a sobra so muda no mes seguinte, quando ja nao da pra fazer nada.
    // Meses futuros nao tem gasto ainda; ai o tipico e a melhor aposta.
    const variavelDoMes = projecao ? projecao.projetadoFechar : b.rotinaTipica
    const teto = capForMonth(input.caps, ym)
    columns.push({
      ym,
      label: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      isCurrent,
      variavel: variavelDoMes,
      fixas: b.fixoTipico,
      trombadoes,
      teto,
      sobra: teto == null
        ? null
        : sobraPrevista({ teto, variavel: variavelDoMes, fixas: b.fixoTipico, trombadoes: tromTotal }),
      projecao,
      settlement: input.settlementByYm?.[ym] ?? null,
    })
  }
  // "Mes mais apertado" so faz sentido entre meses que tem sobra calculada.
  const comSobra = columns.filter((c) => c.sobra !== null)
  const mesApertadoYm = comSobra.length
    ? comSobra.reduce((min, c) => (c.sobra! < min.sobra! ? c : min)).ym
    : null
  return { columns, resumo: { totalTrombadoes, mesApertadoYm } }
}
