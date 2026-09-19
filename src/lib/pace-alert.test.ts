// src/lib/pace-alert.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deveAlertar } from './pace-alert.ts'

const ok = { sobra: -30000, jaAlertou: false, diaDoMes: 12, temTeto: true }

test('sobra negativa no meio do mes alerta', () => {
  assert.equal(deveAlertar(ok), true)
})

test('sobra positiva nao alerta', () => {
  assert.equal(deveAlertar({ ...ok, sobra: 50000 }), false)
})

test('sobra exatamente zero nao alerta', () => {
  assert.equal(deveAlertar({ ...ok, sobra: 0 }), false)
})

test('nao repete quando ja alertou neste mes', () => {
  assert.equal(deveAlertar({ ...ok, jaAlertou: true }), false)
})

test('nao alerta antes do dia 5 — projecao instavel no comeco do mes', () => {
  // No dia 2, um almoco caro vira projecao absurda. Como o e-mail e um por mes,
  // disparar ali queimaria o aviso do mes inteiro a toa.
  assert.equal(deveAlertar({ ...ok, diaDoMes: 2 }), false)
})

test('dia 5 ja vale', () => {
  assert.equal(deveAlertar({ ...ok, diaDoMes: 5 }), true)
})

test('sem teto combinado nao alerta', () => {
  // Sem teto nao existe "nao vai fechar": nao ha regua contra a qual dizer isso.
  // Sem esta guarda, quem nunca definiu teto levaria um alerta falso todo dia 5.
  assert.equal(deveAlertar({ ...ok, temTeto: false }), false)
})
