// src/lib/iof.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pairIofSplits, isIof, type IofTx } from './iof.ts'

let seq = 0
const tx = (r: Partial<IofTx>): IofTx => ({
  id: `t${++seq}`, account_id: 'cartao', transaction_date: '2026-09-17',
  description: 'Loja', category_id: 'cat', split_mine_pct: null,
  created_at: `2026-01-01T00:00:${String(seq).padStart(2, '0')}`, ...r,
})
const iof = (r: Partial<IofTx> = {}) => tx({ description: 'IOF de compra internacional', category_id: 'iof', ...r })
const all = () => true

test('isIof casa a palavra, não pedaço dela', () => {
  assert.equal(isIof('IOF de compra internacional'), true)
  assert.equal(isIof('Biofarma'), false)
})

test('mesmo dia: IOF segue a compra lançada antes dele', () => {
  const compra = tx({ split_mine_pct: 0 })
  const i = iof({ split_mine_pct: 50 })
  assert.deepEqual(pairIofSplits([compra, i], all), [{ id: i.id, split_mine_pct: 0 }])
})

test('Nubank: IOF no dia seguinte acha a compra da véspera', () => {
  const compra = tx({ transaction_date: '2026-09-17', split_mine_pct: 100 })
  const i = iof({ transaction_date: '2026-09-18' })
  assert.deepEqual(pairIofSplits([i, compra], all), [{ id: i.id, split_mine_pct: 100 }])
})

test('véspera ganha de compra lançada depois no mesmo dia', () => {
  const vespera = tx({ transaction_date: '2026-09-17', split_mine_pct: 100 })
  const i = iof({ transaction_date: '2026-09-18' })
  const depois = tx({ transaction_date: '2026-09-18', split_mine_pct: 0 })
  assert.deepEqual(pairIofSplits([vespera, i, depois], all), [{ id: i.id, split_mine_pct: 100 }])
})

test('sem nada antes, usa a compra do mesmo dia lançada depois', () => {
  const i = iof()
  const depois = tx({ split_mine_pct: 0 })
  assert.deepEqual(pairIofSplits([i, depois], all), [{ id: i.id, split_mine_pct: 0 }])
})

test('não pareia com compra de mais de 3 dias antes nem de outra conta', () => {
  const velha = tx({ transaction_date: '2026-09-10', split_mine_pct: 0 })
  const outraConta = tx({ account_id: 'debito', transaction_date: '2026-09-18', split_mine_pct: 0 })
  const i = iof({ transaction_date: '2026-09-18', split_mine_pct: 50 })
  assert.deepEqual(pairIofSplits([velha, outraConta, i], all), [])
})

test('ignora compra sem categoria e IOF que não se qualifica', () => {
  const semCat = tx({ category_id: null, split_mine_pct: 0 })
  const i = iof({ split_mine_pct: 50 })
  assert.deepEqual(pairIofSplits([semCat, i], all), [])
  const compra = tx({ split_mine_pct: 0 })
  assert.deepEqual(pairIofSplits([compra, i], () => false), [])
})

test('compra em moeda estrangeira ganha da compra em real mais recente', () => {
  const gringa = tx({ transaction_date: '2026-08-24', od: '2026-08-24T17:00', cur: 'USD', split_mine_pct: 100 })
  const nacional = tx({ transaction_date: '2026-08-24', od: '2026-08-24T20:00', cur: 'BRL', split_mine_pct: 0 })
  const i = iof({ transaction_date: '2026-08-25', od: '2026-08-25T04:35' })
  assert.deepEqual(pairIofSplits([gringa, nacional, i], all), [{ id: i.id, split_mine_pct: 100 }])
})

test('entre compras estrangeiras, a que bate com 3,5% ganha da mais recente', () => {
  const certa = tx({ transaction_date: '2026-08-23', cur: 'USD', amount_cents: -10000, split_mine_pct: 0 })
  const recente = tx({ transaction_date: '2026-08-24', cur: 'USD', amount_cents: -2000, split_mine_pct: 100 })
  const i = iof({ transaction_date: '2026-08-25', amount_cents: -350 })
  assert.deepEqual(pairIofSplits([certa, recente, i], all), [{ id: i.id, split_mine_pct: 0 }])
})

test('IOF que diz a loja pareia com ela, mesmo não sendo a mais recente', () => {
  const alibaba = tx({ transaction_date: '2026-08-21', description: 'Alibaba.Com Singapore', cur: 'USD', split_mine_pct: 100 })
  const outra = tx({ transaction_date: '2026-08-22', description: 'Patreon* Membership', cur: 'USD', split_mine_pct: 0 })
  const i = iof({ transaction_date: '2026-08-22', description: 'IOF de "Alibaba.Com Singapore"' })
  assert.deepEqual(pairIofSplits([alibaba, outra, i], all), [{ id: i.id, split_mine_pct: 100 }])
})
