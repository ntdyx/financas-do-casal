// src/lib/parcela-dono.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitPeloDono, type Dono, type ParcelaTx } from './parcela-dono.ts'

const donos = new Map<string, Dono>([['nat', 'me'], ['jen', 'pessoa2']])
let seq = 0
const tx = (account_id: string, description: string, split_mine_pct: number | null): ParcelaTx =>
  ({ id: `t${++seq}`, account_id, description, split_mine_pct })

test('parcela individual vai pro dono do cartão', () => {
  const a = tx('nat', 'Maislaser 4/10', 0)
  const b = tx('jen', 'Maislaser 4/10', 100)
  assert.deepEqual(splitPeloDono([a, b], donos), [
    { id: a.id, split_mine_pct: 100 },
    { id: b.id, split_mine_pct: 0 },
  ])
})

test('parcela 50/50 e compra sem parcela não mudam', () => {
  assert.deepEqual(splitPeloDono([tx('nat', 'Elo7 3/4', 50), tx('nat', 'Padaria', 0)], donos), [])
})

test('conta compartilhada fica de fora', () => {
  assert.deepEqual(splitPeloDono([tx('xp', 'Maislaser 4/10', 0)], donos), [])
})

test('parcela sem divisão herda o dono quando as irmãs são individuais', () => {
  const nova = tx('jen', 'MAISLASER 10/10', null)
  assert.deepEqual(splitPeloDono([tx('jen', 'Maislaser 9/10', 0), nova], donos), [{ id: nova.id, split_mine_pct: 0 }])
})

test('parcela sem divisão fica pra revisão se as irmãs são 50/50', () => {
  assert.deepEqual(splitPeloDono([tx('jen', 'Elo7 3/4', 50), tx('jen', 'Elo7 4/4', null)], donos), [])
})
