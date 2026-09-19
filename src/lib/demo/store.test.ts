import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getStore, resetStore, TABLES } from './store.ts'

test('toda tabela declarada vira um array no store', () => {
  resetStore()
  const s = getStore()
  assert.ok(TABLES.length > 0)
  for (const t of TABLES) assert.ok(Array.isArray(s[t]), `${t} deve ser array`)
})

test('getStore devolve a mesma instância entre chamadas', () => {
  resetStore()
  getStore().categories.push({ id: 'x' })
  assert.equal(getStore().categories.length, 1)
})

test('resetStore recria do zero', () => {
  getStore().categories.push({ id: 'y' })
  resetStore()
  assert.equal(getStore().categories.length, 0)
})
