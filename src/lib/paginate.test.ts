// src/lib/paginate.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllPages, PG_MAX_ROWS } from './paginate.ts'

/** Simula o Supabase: guarda N linhas e NUNCA devolve mais que PG_MAX_ROWS. */
function fakeTable(total: number) {
  const chamadas: Array<[number, number]> = []
  const todas = Array.from({ length: total }, (_, i) => ({ id: i }))
  return {
    chamadas,
    page: async (from: number, to: number) => {
      chamadas.push([from, to])
      const fim = Math.min(to, from + PG_MAX_ROWS - 1)
      return { data: todas.slice(from, fim + 1), error: null }
    },
  }
}

test('junta todas as paginas quando passa do teto', async () => {
  const t = fakeTable(2280)
  const linhas = await fetchAllPages(t.page)
  assert.equal(linhas.length, 2280)
  assert.deepEqual(linhas.at(-1), { id: 2279 })
  assert.deepEqual(t.chamadas, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('para na primeira pagina quando cabe tudo', async () => {
  const t = fakeTable(44)
  assert.equal((await fetchAllPages(t.page)).length, 44)
  assert.equal(t.chamadas.length, 1)
})

test('total multiplo do teto nao entra em loop', async () => {
  const t = fakeTable(2000)
  assert.equal((await fetchAllPages(t.page)).length, 2000)
  assert.equal(t.chamadas.length, 3) // a 3a volta vazia e encerra
})

test('tabela vazia devolve lista vazia', async () => {
  assert.deepEqual(await fetchAllPages(fakeTable(0).page), [])
})

test('erro no meio para a leitura em vez de repetir pra sempre', async () => {
  let n = 0
  const linhas = await fetchAllPages(async () => {
    n++
    if (n === 1) return { data: Array.from({ length: PG_MAX_ROWS }, (_, i) => ({ id: i })), error: null }
    return { data: null, error: { message: 'boom' } }
  })
  assert.equal(linhas.length, PG_MAX_ROWS)
  assert.equal(n, 2)
})
