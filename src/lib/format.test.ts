import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBRL } from './format.ts'

// o Intl separa simbolo e numero com espaco estreito (U+00A0)
const norm = (s: string) => s.replace(/ /g, ' ')

test('formata centavos negativos e positivos', () => {
  assert.equal(norm(formatBRL(-129900)), '-R$ 1.299,00')
  assert.equal(norm(formatBRL(0)), 'R$ 0,00')
  assert.equal(norm(formatBRL(52611_00)), 'R$ 52.611,00')
})

test('NaN nao vira "R$ NaN" na tela', () => {
  // snapshot de mes fechado em formato antigo: um item sem `amount` envenena o
  // reduce e o total chegava aqui como NaN
  assert.equal(formatBRL(NaN), '—')
  assert.equal(formatBRL(Infinity), '—')
  assert.equal(formatBRL(-Infinity), '—')
})
