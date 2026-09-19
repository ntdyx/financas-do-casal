import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBillActiveIn } from './fixed-window.ts'

const turbi = { started_on: null, ended_on: '2026-09-30' }
const carro = { started_on: '2026-10-01', ended_on: null }
const sempre = { started_on: null, ended_on: null }

test('conta sem janela vale em qualquer mes', () => {
  assert.equal(isBillActiveIn(sempre, '2025-01'), true)
  assert.equal(isBillActiveIn(sempre, '2030-12'), true)
})

test('conta encerrada vale ATE o mes do fim, inclusive', () => {
  assert.equal(isBillActiveIn(turbi, '2026-08'), true)
  assert.equal(isBillActiveIn(turbi, '2026-09'), true, 'o mes em que acabou ainda conta')
  assert.equal(isBillActiveIn(turbi, '2026-10'), false)
})

test('conta que comeca no futuro nao cobra o passado', () => {
  assert.equal(isBillActiveIn(carro, '2026-09'), false)
  assert.equal(isBillActiveIn(carro, '2026-10'), true, 'o mes em que comecou ja conta')
  assert.equal(isBillActiveIn(carro, '2027-03'), true)
})

test('o fim no meio do mes ainda vale o mes inteiro', () => {
  // Turbi encerrado dia 12/09: setembro ja teve pagamento, entao o mes conta.
  const meio = { started_on: null, ended_on: '2026-09-12' }
  assert.equal(isBillActiveIn(meio, '2026-09'), true)
  assert.equal(isBillActiveIn(meio, '2026-10'), false)
})

test('o inicio no meio do mes ja vale o mes inteiro', () => {
  const meio = { started_on: '2026-10-20', ended_on: null }
  assert.equal(isBillActiveIn(meio, '2026-09'), false)
  assert.equal(isBillActiveIn(meio, '2026-10'), true)
})

test('janela de um mes so', () => {
  const unico = { started_on: '2026-11-01', ended_on: '2026-11-30' }
  assert.equal(isBillActiveIn(unico, '2026-10'), false)
  assert.equal(isBillActiveIn(unico, '2026-11'), true)
  assert.equal(isBillActiveIn(unico, '2026-12'), false)
})

test('campos ausentes (linha vinda de select antigo) nao escondem a conta', () => {
  assert.equal(isBillActiveIn({}, '2026-09'), true)
})

test('virada de ano', () => {
  const b = { started_on: '2026-12-01', ended_on: '2027-01-31' }
  assert.equal(isBillActiveIn(b, '2026-11'), false)
  assert.equal(isBillActiveIn(b, '2026-12'), true)
  assert.equal(isBillActiveIn(b, '2027-01'), true)
  assert.equal(isBillActiveIn(b, '2027-02'), false)
})
