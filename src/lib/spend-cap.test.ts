// src/lib/spend-cap.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capForMonth, type SpendCapRow } from './spend-cap.ts'

const cap = (amount_cents: number, effective_from: string): SpendCapRow => ({ amount_cents, effective_from })

test('sem teto cadastrado devolve null', () => {
  assert.equal(capForMonth([], '2026-08'), null)
})

test('um teto so vale de la pra frente', () => {
  const rows = [cap(120000, '2026-06-01')]
  assert.equal(capForMonth(rows, '2026-08'), 120000)
  assert.equal(capForMonth(rows, '2026-06'), 120000)
})

test('teto com inicio no futuro nao vale pro mes atual', () => {
  assert.equal(capForMonth([cap(120000, '2026-09-01')], '2026-08'), null)
})

test('trocar o teto nao reescreve o mes passado', () => {
  const rows = [cap(120000, '2026-01-01'), cap(90000, '2026-08-01')]
  assert.equal(capForMonth(rows, '2026-07'), 120000)
  assert.equal(capForMonth(rows, '2026-08'), 90000)
})

test('ordem das linhas nao importa', () => {
  const rows = [cap(90000, '2026-08-01'), cap(120000, '2026-01-01')]
  assert.equal(capForMonth(rows, '2026-09'), 90000)
})

test('duas linhas no mesmo mes: vale a ULTIMA, nao a ordem que o banco devolver', () => {
  // Antes o app fazia INSERT: digitar 5.000 por engano e corrigir pra 12.000
  // deixava duas linhas com o mesmo effective_from, e `capForMonth` devolvia uma
  // ou outra dependendo da ordem. Agora e upsert + unique (migration
  // 20260910100000), mas a funcao tem que ser estavel de qualquer jeito: quem
  // vem depois na lista ganha.
  const erro = { amount_cents: 500000, effective_from: '2026-08-01' }
  const correcao = { amount_cents: 1200000, effective_from: '2026-08-01' }
  assert.equal(capForMonth([erro, correcao], '2026-08'), 1200000)
  // e a lista chega ordenada por created_at, entao a correcao e sempre a ultima
})
