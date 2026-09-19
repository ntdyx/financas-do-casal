// src/lib/gastos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baldeDe, separaGastos, contraOTeto, EXTRAORDINARIO_CENTS, type GastoTx } from './gastos.ts'

const g = (r: Partial<GastoTx> & { amount_cents: number }): GastoTx => ({
  is_fixed: null, fixed_bill_id: null, categories: null, ...r,
})

test('gasto pequeno do dia a dia e rotina', () => {
  assert.equal(baldeDe(g({ amount_cents: -4500 })), 'rotina')
})

test('compra unica acima do corte e extraordinario', () => {
  assert.equal(baldeDe(g({ amount_cents: -10400000 })), 'extraordinario') // o carro
})

test('o corte e inclusivo: exatamente R$ 3.000 ja e extraordinario', () => {
  assert.equal(baldeDe(g({ amount_cents: -EXTRAORDINARIO_CENTS })), 'extraordinario')
  assert.equal(baldeDe(g({ amount_cents: -(EXTRAORDINARIO_CENTS - 1) })), 'rotina')
})

test('recorrente ganha do corte de valor: aluguel caro nao vira evento', () => {
  // Aluguel de 6.578 passa dos 3.000 TODO mes. Chamar isso de compra unica
  // tiraria a maior despesa fixa da casa da conta do teto.
  assert.equal(baldeDe(g({ amount_cents: -657846, is_fixed: true })), 'recorrente')
  assert.equal(baldeDe(g({ amount_cents: -657846, fixed_bill_id: 'b' })), 'recorrente')
})

test('assinatura por categoria tambem e recorrente', () => {
  assert.equal(baldeDe(g({ amount_cents: -5500, categories: { name: 'Streaming' } })), 'recorrente')
})

test('separaGastos soma cada balde e ignora entradas', () => {
  const b = separaGastos([
    g({ amount_cents: -657846, is_fixed: true }),  // recorrente
    g({ amount_cents: -4500 }),                    // rotina
    g({ amount_cents: -12000 }),                   // rotina
    g({ amount_cents: -2967359 }),                 // extraordinario (o cambio)
    g({ amount_cents: 1160000 }),                  // entrada: ignorada
  ])
  assert.deepEqual(b, { recorrente: 657846, rotina: 16500, extraordinario: 2967359 })
})

test('contraOTeto NAO inclui o extraordinario', () => {
  // Julho/2026: rotina de 41.802 e um carro de 104.000. O que disputa o teto
  // e a rotina + o recorrente; o carro e decisao de patrimonio.
  const b = separaGastos([
    g({ amount_cents: -1558130, is_fixed: true }),
    g({ amount_cents: -100000 }),
    g({ amount_cents: -10400000 }),
  ])
  assert.equal(contraOTeto(b), 1558130 + 100000)
})

test('lista vazia zera os tres baldes', () => {
  assert.deepEqual(separaGastos([]), { recorrente: 0, rotina: 0, extraordinario: 0 })
})
