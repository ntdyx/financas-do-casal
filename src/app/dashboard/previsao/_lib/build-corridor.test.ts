// src/app/dashboard/previsao/_lib/build-corridor.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCorridor } from './build-corridor.ts'
import type { PlannedBill } from './planned.ts'
import type { HistTx } from './forecast.ts'

const ipva: PlannedBill = { id: 'p', name: 'IPVA', emoji: '🚗', amount_cents: 300000,
  recurrence: 'yearly', month: 10, year: null, installments: 1, split_mine_pct: null, active: true }

// Teto de 10.000/mes valendo desde janeiro.
const caps = [{ amount_cents: 1000000, effective_from: '2026-01-01' }]

test('monta 3 colunas a partir do mes corrente', () => {
  const r = buildCorridor({
    now: new Date(2026, 7, 10), histTxs: [], mesAtualGastos: [], planned: [ipva], caps,
  })
  assert.deepEqual(r.columns.map(c => c.ym), ['2026-08', '2026-09', '2026-10'])
  assert.equal(r.columns[0].isCurrent, true)
  assert.equal(r.columns[2].trombadoes.length, 1)   // IPVA cai em outubro
  assert.equal(r.resumo.totalTrombadoes, 300000)
  assert.equal(r.resumo.mesApertadoYm, '2026-10')   // menor sobra (tem o trombadao)
})

const MESES_BASE = ['01', '02', '03', '04', '05', '06', '07'] // jan..jul de 2026

test('fixas vem do baseline (fixoTipico), nao de um proxy do mes parcial', () => {
  // Aluguel de 300 em todo mes fechado, e um mes com 500 (reajuste pontual).
  // A mediana devolve 300 — o valor que descreve os meses, nao o desvio.
  const histTxs = MESES_BASE.map((m) => ({
    amount_cents: m === '07' ? -50000 : -30000,
    transaction_date: `2026-${m}-05`,
    is_fixed: true,
  }))
  const r = buildCorridor({
    now: new Date(2026, 7, 10), histTxs, mesAtualGastos: [], planned: [], caps,
  })
  assert.equal(r.columns[0].fixas, 30000)
  assert.equal(r.columns[1].fixas, 30000) // mesmo valor no mes futuro tambem
})

// Base realista: 1.000 de rotina em cada mes fechado -> rotinaTipica = 100000,
// fixoTipico = 0. O teto e 10.000.
const baseRotina: HistTx[] = MESES_BASE.map((m) => ({ amount_cents: -100000, transaction_date: `2026-${m}-05` }))

test('sobra do mes corrente usa a projecao, nao a rotina tipica', () => {
  const now = new Date(2026, 7, 10) // 10 de agosto -> base = jan..jul
  // Agosto correndo alto: 900 em 5 compras de 180.
  const agosto: HistTx[] = [3, 4, 5, 6, 7].map((d) => ({
    amount_cents: -18000, transaction_date: `2026-08-0${d}`,
  }))

  const { columns } = buildCorridor({
    now, histTxs: [...baseRotina, ...agosto], mesAtualGastos: agosto, planned: [], caps,
  })
  const atual = columns[0]

  // projecao: 90000 corridos em 10 dias * 31 dias de agosto = 279000
  assert.equal(atual.isCurrent, true)
  assert.equal(atual.projecao?.projetadoFechar, 279000)
  assert.equal(atual.variavel, 279000, 'a coluna mostra a projecao, nao o tipico')
  assert.equal(atual.sobra, 1000000 - 279000) // 721000
})

test('meses futuros continuam usando a rotina tipica', () => {
  const now = new Date(2026, 7, 10)
  const { columns } = buildCorridor({
    now, histTxs: baseRotina, mesAtualGastos: [], planned: [], caps,
  })
  const futuro = columns[1] // setembro

  assert.equal(futuro.projecao, null)
  assert.equal(futuro.variavel, 100000)
  assert.equal(futuro.sobra, 1000000 - 100000) // 900000
})

test('sem teto nenhum, a sobra e null em vez de um numero inventado', () => {
  const { columns, resumo } = buildCorridor({
    now: new Date(2026, 7, 10), histTxs: baseRotina, mesAtualGastos: [], planned: [], caps: [],
  })
  assert.equal(columns[0].teto, null)
  assert.equal(columns[0].sobra, null)
  assert.equal(resumo.mesApertadoYm, null, 'sem regua nao ha mes mais apertado')
})

test('teto novo no meio do corredor vale so dos meses dele em diante', () => {
  // Combinaram 10.000 em janeiro e 6.000 a partir de setembro.
  const doisTetos = [
    { amount_cents: 1000000, effective_from: '2026-01-01' },
    { amount_cents: 600000, effective_from: '2026-09-01' },
  ]
  const { columns } = buildCorridor({
    now: new Date(2026, 7, 10), histTxs: baseRotina, mesAtualGastos: [], planned: [], caps: doisTetos,
  })
  assert.equal(columns[0].teto, 1000000) // agosto
  assert.equal(columns[1].teto, 600000)  // setembro
  assert.equal(columns[2].teto, 600000)  // outubro herda setembro
})

test('o carro do mes nao entra na projecao — sai na linha do extraordinario', () => {
  const now = new Date(2026, 7, 10)
  const agosto: HistTx[] = [
    { amount_cents: -18000, transaction_date: '2026-08-05' },
    { amount_cents: -10400000, transaction_date: '2026-08-06' }, // o carro
  ]
  const { columns } = buildCorridor({
    now, histTxs: [...baseRotina, ...agosto], mesAtualGastos: agosto, planned: [], caps,
  })
  const atual = columns[0]
  assert.equal(atual.projecao?.extraordinario, 10400000)
  assert.equal(atual.variavel, 55800) // 18000/10*31 — so a rotina
  assert.equal(atual.sobra, 1000000 - 55800, 'o carro nao consome o teto')
})
