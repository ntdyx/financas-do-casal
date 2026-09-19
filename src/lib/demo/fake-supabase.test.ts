// src/lib/demo/fake-supabase.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getStore, resetStore } from './store.ts'
import { createFakeClient } from './fake-supabase.ts'

beforeEach(() => {
  resetStore()
  const s = getStore()
  s.categories.push({ id: 'c1', name: 'Mercado', emoji: '🛒', color: '#22c55e' })
  s.accounts.push({ id: 'a1', owner: 'shared', name: 'Conjunta' })
  s.transactions.push(
    { id: 't1', user_id: 'u', amount_cents: -1000, is_transfer: false, transaction_date: '2026-07-10', category_id: 'c1', account_id: 'a1', split_mine_pct: 50 },
    { id: 't2', user_id: 'u', amount_cents: -2000, is_transfer: false, transaction_date: '2026-07-05', category_id: null, account_id: 'a1', split_mine_pct: 100 },
    { id: 't3', user_id: 'u', amount_cents: -3000, is_transfer: true,  transaction_date: '2026-06-30', category_id: 'c1', account_id: 'a1', split_mine_pct: 0 },
  )
})

test('eq + gte/lte + order', async () => {
  const db = createFakeClient()
  const { data } = await db.from('transactions').select('id, transaction_date')
    .eq('is_transfer', false)
    .gte('transaction_date', '2026-07-01').lte('transaction_date', '2026-07-31')
    .order('transaction_date', { ascending: false })
  assert.deepEqual((data as any[]).map(r => r.id), ['t1', 't2'])
})

test('embed de categories vem como objeto', async () => {
  const db = createFakeClient()
  const { data } = await db.from('transactions').select('id, categories(id, name, emoji)').eq('id', 't1')
  assert.equal((data as any[])[0].categories.name, 'Mercado')
})

test('embed nulo quando category_id é null', async () => {
  const db = createFakeClient()
  const { data } = await db.from('transactions').select('id, categories(name)').eq('id', 't2')
  assert.equal((data as any[])[0].categories, null)
})

test('not is null', async () => {
  const db = createFakeClient()
  const { data } = await db.from('transactions').select('id').not('category_id', 'is', null)
  assert.deepEqual((data as any[]).map(r => r.id).sort(), ['t1', 't3'])
})

test('in()', async () => {
  const db = createFakeClient()
  const { data } = await db.from('transactions').select('id').in('id', ['t1', 't3'])
  assert.equal((data as any[]).length, 2)
})

test('maybeSingle devolve objeto ou null', async () => {
  const db = createFakeClient()
  const { data: hit } = await db.from('categories').select('*').eq('id', 'c1').maybeSingle()
  assert.equal((hit as any).name, 'Mercado')
  const { data: miss } = await db.from('categories').select('*').eq('id', 'zzz').maybeSingle()
  assert.equal(miss, null)
})

test('limit e range', async () => {
  const db = createFakeClient()
  const { data: lim } = await db.from('transactions').select('id').order('transaction_date', { ascending: true }).limit(1)
  assert.equal((lim as any[]).length, 1)
  const { data: rng } = await db.from('transactions').select('id').order('transaction_date', { ascending: true }).range(1, 2)
  assert.equal((rng as any[]).length, 2)
})

test('select count exact devolve total ignorando range', async () => {
  const db = createFakeClient()
  const { data, count } = await db.from('transactions')
    .select('id', { count: 'exact' }).order('transaction_date', { ascending: true }).range(0, 0)
  assert.equal(count, 3)
  assert.equal((data as any[]).length, 1)
})

test('select head:true devolve count sem linhas', async () => {
  const db = createFakeClient()
  const { data, count } = await db.from('transactions')
    .select('id', { count: 'exact', head: true }).eq('is_transfer', false)
  assert.equal(count, 2)
  assert.equal(data, null)
})

test('update aplica patch nas linhas filtradas', async () => {
  const db = createFakeClient()
  await db.from('transactions').update({ category_id: 'c1' }).eq('id', 't2')
  const { data } = await db.from('transactions').select('category_id').eq('id', 't2').single()
  assert.equal((data as any).category_id, 'c1')
})

test('insert cria linha com id e devolve com select', async () => {
  const db = createFakeClient()
  const { data } = await db.from('category_rules')
    .insert({ user_id: 'u', description_pattern: 'x', category_id: 'c1' }).select()
  assert.ok((data as any[])[0].id)
  const { data: all } = await db.from('category_rules').select('*')
  assert.equal((all as any[]).length, 1)
})

test('upsert atualiza no conflito e insere fora dele', async () => {
  const db = createFakeClient()
  await db.from('split_rules').upsert(
    { user_id: 'u', description_pattern: 'p', mine_pct: 50 }, { onConflict: 'user_id,description_pattern' })
  await db.from('split_rules').upsert(
    { user_id: 'u', description_pattern: 'p', mine_pct: 100 }, { onConflict: 'user_id,description_pattern' })
  const { data } = await db.from('split_rules').select('*')
  assert.equal((data as any[]).length, 1)
  assert.equal((data as any[])[0].mine_pct, 100)
})

test('delete remove linhas filtradas', async () => {
  const db = createFakeClient()
  await db.from('transactions').delete().eq('id', 't3')
  const { data } = await db.from('transactions').select('id')
  assert.equal((data as any[]).some(r => r.id === 't3'), false)
})
