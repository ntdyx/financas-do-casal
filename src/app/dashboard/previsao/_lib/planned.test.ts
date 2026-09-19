// src/app/dashboard/previsao/_lib/planned.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plannedForMonth, type PlannedBill } from './planned.ts'

const base: PlannedBill = {
  id: 'p1', name: 'IPVA', emoji: '🚗', amount_cents: 300000,
  recurrence: 'yearly', month: 3, year: null, installments: 3, split_mine_pct: 50, active: true,
}

test('yearly casa pelo mes, ignora ano', () => {
  const hits = plannedForMonth([base], '2027-03')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].amount_cents, 100000)      // 300000 / 3
  assert.equal(hits[0].installmentLabel, '1/3')
})

test('yearly nao casa em outro mes', () => {
  assert.deepEqual(plannedForMonth([base], '2026-04'), [])
})

test('once casa so no mes/ano exato', () => {
  const p: PlannedBill = { ...base, recurrence: 'once', month: 9, year: 2026, installments: 1 }
  assert.equal(plannedForMonth([p], '2026-09').length, 1)
  assert.equal(plannedForMonth([p], '2027-09').length, 0)
})

test('semiannual casa nos dois meses', () => {
  const p: PlannedBill = { ...base, recurrence: 'semiannual', month: 3, installments: 1 }
  assert.equal(plannedForMonth([p], '2026-03').length, 1) // mes base
  assert.equal(plannedForMonth([p], '2026-09').length, 1) // +6
})

test('inativo nao aparece', () => {
  assert.deepEqual(plannedForMonth([{ ...base, active: false }], '2026-03'), [])
})
