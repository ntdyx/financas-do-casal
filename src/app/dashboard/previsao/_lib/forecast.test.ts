// src/app/dashboard/previsao/_lib/forecast.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mesesBase, baseline, projetaFatura, sobraPrevista, type HistTx } from './forecast.ts'

test('mesesBase: agosto usa os meses fechados do proprio ano', () => {
  assert.deepEqual(mesesBase(new Date(2026, 7, 15)), // agosto (mes index 7)
    ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'])
})

test('mesesBase: janeiro cai pros tres ultimos meses do ano anterior', () => {
  // Sem isto o baseline zera em janeiro e o card fica sem referencia nenhuma.
  assert.deepEqual(mesesBase(new Date(2026, 0, 10)), ['2025-10', '2025-11', '2025-12'])
})

test('mesesBase: fevereiro completa com o ano anterior ate ter tres meses', () => {
  assert.deepEqual(mesesBase(new Date(2026, 1, 3)), ['2025-11', '2025-12', '2026-01'])
})

test('mesesBase: abril ja tem tres meses proprios e nao puxa o ano anterior', () => {
  assert.deepEqual(mesesBase(new Date(2026, 3, 20)), ['2026-01', '2026-02', '2026-03'])
})

test('baseline separa fixo de rotina pelos meses fechados', () => {
  const txs = [
    { amount_cents: -30000, transaction_date: '2026-01-05', is_fixed: true },   // fixo jan
    { amount_cents: -10000, transaction_date: '2026-01-20' },                    // rotina jan
    { amount_cents: -30000, transaction_date: '2026-02-05', fixed_bill_id: 'b' },// fixo fev
    { amount_cents: -20000, transaction_date: '2026-02-22' },                    // rotina fev
  ]
  const b = baseline(txs, ['2026-01', '2026-02'])
  assert.equal(b.fixoTipico, 30000)     // mediana de dois iguais
  assert.equal(b.rotinaTipica, 15000)   // mediana de 10000 e 20000
  assert.equal(b.mesesBase, 2)
})

test('baseline sem meses fechados zera', () => {
  assert.deepEqual(baseline([{ amount_cents: -100, transaction_date: '2026-01-01' }], []),
    { fixoTipico: 0, rotinaTipica: 0, mesesBase: 0 })
})

test('projetaFatura: extrapola a rotina pelo dia e classifica ritmo', () => {
  // dia 10 de um mes de 31 dias. Quatro compras de 200 -> 800 em 10 dias -> 2.480.
  const now = new Date(2026, 7, 10) // 10 ago (31 dias)
  const gastos = [5, 6, 7, 8].map((d) => ({
    amount_cents: -20000, transaction_date: `2026-08-0${d}`,
  }))
  const p = projetaFatura(gastos, now, 200000)
  assert.equal(p.correndo, 80000)
  assert.equal(p.projetadoFechar, 248000) // 80000/10*31
  assert.equal(p.ritmo, 'acelerado')      // 248000 > 200000*1.1
})

test('projetaFatura: rotinaTipica 0 -> no-ritmo', () => {
  const p = projetaFatura([], new Date(2026, 7, 10), 0)
  assert.equal(p.ritmo, 'no-ritmo')
})

test('sobraPrevista: teto menos o que ja tem dono', () => {
  assert.equal(sobraPrevista({ teto: 600000, variavel: 150000, fixas: 200000, trombadoes: 100000 }), 150000)
})

test('projetaFatura ignora fixos no correndo', () => {
  const now = new Date(2026, 7, 2) // 2 ago (31 dias)
  const txs = [
    { amount_cents: -30000, transaction_date: '2026-08-01', is_fixed: true }, // fixo, ignorado
    { amount_cents: -5000,  transaction_date: '2026-08-02' },                 // rotina
  ]
  const p = projetaFatura(txs, now, 200000)
  assert.equal(p.correndo, 5000)          // so a rotina
  assert.equal(p.projetadoFechar, 77500)  // 5000/2*31
  assert.equal(p.ritmo, 'devagar')        // 77500 < 200000*0.9
})

// --- o extraordinario fica FORA do tipico e FORA da projecao ---

test('baseline: o mes do carro nao mexe na rotina tipica', () => {
  // Seis meses de 1.000 de rotina; num deles tambem um carro de 100.000.
  // O carro nao entra na rotina de jeito nenhum — nem pela media, nem pela
  // mediana, nem "escondido": ele e outro balde.
  const meses = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  const txs: HistTx[] = meses.map((m) => ({ amount_cents: -100000, transaction_date: `${m}-10` }))
  txs.push({ amount_cents: -10000000, transaction_date: '2026-06-28' }) // o carro
  assert.equal(baseline(txs, meses).rotinaTipica, 100000)
})

test('baseline: dois meses com um evento cada tambem nao envenenam o tipico', () => {
  // Era o limite da mediana: com eventos em metade dos meses ela deixava de
  // proteger. Separando por balde, o numero de eventos deixa de importar.
  const meses = ['2026-01', '2026-02', '2026-03', '2026-04']
  const txs: HistTx[] = meses.map((m) => ({ amount_cents: -100000, transaction_date: `${m}-10` }))
  txs.push({ amount_cents: -5000000, transaction_date: '2026-03-20' })
  txs.push({ amount_cents: -6000000, transaction_date: '2026-04-20' })
  assert.equal(baseline(txs, meses).rotinaTipica, 100000)
})

test('baseline conta como zero o mes fechado sem gasto nenhum', () => {
  const meses = ['2026-01', '2026-02', '2026-03']
  const txs: HistTx[] = [{ amount_cents: -30000, transaction_date: '2026-02-10' }]
  // valores por mes: 0, 30000, 0 -> mediana 0
  assert.equal(baseline(txs, meses).rotinaTipica, 0)
})

test('projecao nao extrapola nem soma o extraordinario — ele sai por fora', () => {
  // Dia 10 de um mes de 31. Rotina: 300 em 10 dias -> projeta 930. A compra
  // unica de 5.000 nao entra no projetado: ela nao disputa o teto.
  const now = new Date(2026, 7, 10)
  const gastos: HistTx[] = [
    { amount_cents: -30000, transaction_date: '2026-08-04' },
    { amount_cents: -500000, transaction_date: '2026-08-06' }, // extraordinario
  ]
  const p = projetaFatura(gastos, now, 200000)
  assert.equal(p.correndo, 30000)
  assert.equal(p.projetadoFechar, 93000)
  assert.equal(p.extraordinario, 500000)
})
