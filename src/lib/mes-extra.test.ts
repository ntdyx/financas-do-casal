// src/lib/mes-extra.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMesExtra, type ExtraTx } from './mes-extra.ts'

const t = (r: Partial<ExtraTx> & { amount_cents: number }): ExtraTx => ({
  split_mine_pct: null, is_fixed: null, fixed_bill_id: null, categories: null, ...r,
})

test('gasto dividido entra no extra do casal pelo valor cheio', () => {
  const r = computeMesExtra([t({ amount_cents: -10000, split_mine_pct: 50 })])
  assert.equal(r.casal, 10000)
  assert.equal(r.nat, 0)
  assert.equal(r.jen, 0)
})

test('100% e da pessoa 1, 0% e da pessoa 2', () => {
  const r = computeMesExtra([
    t({ amount_cents: -3000, split_mine_pct: 100 }),
    t({ amount_cents: -2000, split_mine_pct: 0 }),
  ])
  assert.equal(r.nat, 3000)
  assert.equal(r.jen, 2000)
  assert.equal(r.casal, 0)
})

test('recorrente sai do extra e vai pro total realizado', () => {
  const r = computeMesExtra([
    t({ amount_cents: -150000, split_mine_pct: 50, is_fixed: true }),                    // aluguel
    t({ amount_cents: -5000, split_mine_pct: 100, categories: { name: 'Streaming' } }),  // netflix
    t({ amount_cents: -4000, split_mine_pct: 50 }),                                      // jantar
  ])
  assert.equal(r.recorrenteRealizado, 155000)
  assert.equal(r.casal, 4000)
  assert.equal(r.nat, 0)
})

test('entrada (valor positivo) e ignorada', () => {
  const r = computeMesExtra([t({ amount_cents: 500000, split_mine_pct: 50 })])
  assert.deepEqual(r, { casal: 0, nat: 0, jen: 0, recorrenteRealizado: 0, extraordinario: 0 })
})

test('compra unica grande vai pro extraordinario, nao pro extra de ninguem', () => {
  // O carro de julho: dividido 50/50, mas nao disputa o teto do mes. Ratear
  // entre as duas diria que cada uma estourou o proprio espaco por causa dele.
  const r = computeMesExtra([
    t({ amount_cents: -10400000, split_mine_pct: 50 }),
    t({ amount_cents: -4000, split_mine_pct: 50 }),
  ])
  assert.equal(r.extraordinario, 10400000)
  assert.equal(r.casal, 4000)
  assert.equal(r.nat, 0)
  assert.equal(r.jen, 0)
})

test('gasto sem divisao nao entra em nenhum dos tres extras', () => {
  // Gasto sem split_mine_pct volta pra revisao no sync — nao da pra atribuir.
  const r = computeMesExtra([t({ amount_cents: -7000, split_mine_pct: null })])
  assert.deepEqual(r, { casal: 0, nat: 0, jen: 0, recorrenteRealizado: 0, extraordinario: 0 })
})

test('lista vazia devolve tudo zerado', () => {
  assert.deepEqual(computeMesExtra([]), { casal: 0, nat: 0, jen: 0, recorrenteRealizado: 0, extraordinario: 0 })
})

import { disponivelDoMes } from './mes-extra.ts'

const extra = (casal: number, nat: number, jen: number, extraordinario = 0) =>
  ({ casal, nat, jen, recorrenteRealizado: 0, extraordinario })

test('disponivel = teto menos o que ja foi e o que ainda vem', () => {
  // Teto 5000; fixas tipicas 2000 (reservadas mesmo sem terem caido ainda);
  // trombadao de 300; ja gastou 800 de rotina. Sobram 1900.
  assert.equal(
    disponivelDoMes({ teto: 500000, fixoTipico: 200000, trombadoes: 30000, extra: extra(50000, 20000, 10000) }),
    190000,
  )
})

test('disponivel reserva a fixa que ainda NAO caiu', () => {
  // O aluguel vence dia 25: se so descontasse o que ja caiu, o card diria que
  // da pra gastar um dinheiro que ja tem dono.
  assert.equal(
    disponivelDoMes({ teto: 300000, fixoTipico: 200000, trombadoes: 0, extra: extra(0, 0, 0) }),
    100000,
  )
})

test('disponivel fica negativo quando ja passou do que cabia', () => {
  assert.equal(
    disponivelDoMes({ teto: 300000, fixoTipico: 200000, trombadoes: 0, extra: extra(150000, 0, 0) }),
    -50000,
  )
})

test('disponivel soma as tres fatias de rotina, nao so a do casal', () => {
  assert.equal(
    disponivelDoMes({ teto: 100000, fixoTipico: 0, trombadoes: 0, extra: extra(10000, 20000, 30000) }),
    40000,
  )
})

test('o extraordinario do mes NAO consome o teto', () => {
  // Comprar um carro nao pode dizer que nao da mais pra pedir um jantar: sao
  // decisoes de naturezas diferentes.
  assert.equal(
    disponivelDoMes({ teto: 100000, fixoTipico: 0, trombadoes: 0, extra: extra(10000, 0, 0, 10400000) }),
    90000,
  )
})
