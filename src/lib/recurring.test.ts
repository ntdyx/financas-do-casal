// src/lib/recurring.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRecorrente, catNameOf, type RecurringTx } from './recurring.ts'

const tx = (r: Partial<RecurringTx> = {}): RecurringTx => ({
  is_fixed: null, fixed_bill_id: null, categories: null, ...r,
})

test('is_fixed marca como recorrente', () => {
  assert.equal(isRecorrente(tx({ is_fixed: true })), true)
})

test('ter fixed_bill_id marca como recorrente', () => {
  assert.equal(isRecorrente(tx({ fixed_bill_id: 'abc' })), true)
})

test('categoria de assinatura marca como recorrente mesmo sem is_fixed', () => {
  // Este e o caso que hoje diverge: recorrente no relatorio, extra na previsao.
  assert.equal(isRecorrente(tx({ categories: { name: 'Streaming' } })), true)
})

test('categoria de assinatura vinda como array (shape do Supabase)', () => {
  assert.equal(isRecorrente(tx({ categories: [{ name: 'Ferramentas' }] })), true)
})

test('gasto comum nao e recorrente', () => {
  assert.equal(isRecorrente(tx({ categories: { name: 'Mercado' } })), false)
})

test('sem nada preenchido nao e recorrente', () => {
  assert.equal(isRecorrente(tx()), false)
})

test('catNameOf devolve "Sem categoria" quando nao ha categoria', () => {
  assert.equal(catNameOf(tx()), 'Sem categoria')
})

test('catNameOf desembrulha array', () => {
  assert.equal(catNameOf(tx({ categories: [{ name: 'Fitness' }] })), 'Fitness')
})
