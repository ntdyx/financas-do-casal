// src/lib/rules.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDescIndex,
  matchRows,
  matchIlike,
  ilikeToRegExp,
  stage,
  newPending,
  plannedUpdates,
  type DescRow,
} from './rules.ts'

const row = (r: Partial<DescRow> & { id: string }): DescRow => ({
  description: null, note: null, category_id: null, split_mine_pct: null,
  fixed_bill_id: null, is_fixed: null, is_transfer: null, ...r,
})

test('indexa por descricao normalizada: grafias diferentes caem na mesma chave', () => {
  const idx = buildDescIndex([
    row({ id: 'a', description: 'SEARA ALIMENTOS LTDA' }),
    row({ id: 'b', description: 'Seara Alimentos' }),
    row({ id: 'c', description: 'Outra coisa' }),
  ])
  const hits = matchRows(idx, 'seara alimentos')
  assert.deepEqual(hits.map((r) => r.id), ['a', 'b'])
})

test('onlyNullField nao toca em quem ja tem o campo preenchido', () => {
  const idx = buildDescIndex([
    row({ id: 'a', description: 'Padaria' }),
    row({ id: 'b', description: 'Padaria', category_id: 'ja-tem' }),
  ])
  assert.deepEqual(matchRows(idx, 'Padaria', 'category_id').map((r) => r.id), ['a'])
})

test('descricao opaca com observacao casa pela observacao', () => {
  // "Transferência enviada" sozinha nao identifica ninguem: a observacao vira o nome.
  const idx = buildDescIndex([row({ id: 'a', description: 'Transferência enviada', note: 'Sabesp' })])
  assert.deepEqual(matchRows(idx, 'Sabesp').map((r) => r.id), ['a'])
})

test('ilike traduz % e _ e escapa o resto', () => {
  assert.ok(ilikeToRegExp('%ifood%').test('COMPRA IFOOD SP'))
  assert.ok(!ilikeToRegExp('%ifood%').test('comida'))
  // 'ifd*%' tem asterisco literal e so casa no comeco
  assert.ok(ilikeToRegExp('ifd*%').test('IFD*1234 RESTAURANTE'))
  assert.ok(!ilikeToRegExp('ifd*%').test('PAGO NO IFD*1234'))
  assert.ok(ilikeToRegExp('a_c').test('abc'))
  assert.ok(!ilikeToRegExp('a_c').test('abbc'))
})

test('matchIlike varre a descricao crua, nao a normalizada', () => {
  // normalizeDesc apaga numeros longos; o ILIKE nao — precisa ver a crua.
  const idx = buildDescIndex([row({ id: 'a', description: 'IFD*99887766 BURGER' })])
  assert.deepEqual(matchIlike(idx, 'ifd*%').map((r) => r.id), ['a'])
})

test('stage agrupa por patch identico', () => {
  const idx = buildDescIndex([
    row({ id: 'a', description: 'Padaria' }),
    row({ id: 'b', description: 'Padaria' }),
    row({ id: 'c', description: 'Uber' }),
  ])
  const pending = newPending()
  stage(pending, matchRows(idx, 'Padaria'), { category_id: 'mercado' })
  stage(pending, matchRows(idx, 'Uber'), { category_id: 'transporte' })
  assert.deepEqual(plannedUpdates(pending), [
    { patch: { category_id: 'mercado' }, ids: ['a', 'b'] },
    { patch: { category_id: 'transporte' }, ids: ['c'] },
  ])
})

test('stage escreve no indice, entao a regra seguinte nao sobrescreve', () => {
  // Duas regras com grafias diferentes normalizam pra mesma chave. No codigo
  // antigo cada uma relia o banco e o filtro `is null` fazia a 1a ganhar.
  // Com o indice em memoria isso so continua valendo se stage mutar a linha.
  const idx = buildDescIndex([row({ id: 'a', description: 'SEARA LTDA' })])
  const pending = newPending()
  stage(pending, matchRows(idx, 'Seara', 'category_id'), { category_id: 'primeira' })
  stage(pending, matchRows(idx, 'SEARA', 'category_id'), { category_id: 'segunda' })
  assert.deepEqual(plannedUpdates(pending), [{ patch: { category_id: 'primeira' }, ids: ['a'] }])
})

test('regras sem guard: vale a ULTIMA, mesmo reusando um grupo antigo', () => {
  // split_rules nao tem guard `is null`: a ultima regra que casa e quem manda.
  // Agrupar por patch e escrever na ordem de criacao do grupo inverteria isso
  // (grupo "50" nasce antes do "0", entao "0" seria escrito por ultimo).
  const idx = buildDescIndex([row({ id: 'a', description: 'Shopify' })])
  const pending = newPending()
  stage(pending, matchRows(idx, 'Shopify'), { split_mine_pct: 50 })
  stage(pending, matchRows(idx, 'Shopify'), { split_mine_pct: 0 })
  stage(pending, matchRows(idx, 'Shopify'), { split_mine_pct: 50 })
  assert.deepEqual(plannedUpdates(pending), [{ patch: { split_mine_pct: 50 }, ids: ['a'] }])
})

test('linha tocada por regras de campos diferentes vira um patch so', () => {
  const idx = buildDescIndex([row({ id: 'a', description: 'Netflix' })])
  const pending = newPending()
  stage(pending, matchRows(idx, 'Netflix'), { category_id: 'streaming' })
  stage(pending, matchRows(idx, 'Netflix'), { is_fixed: true })
  assert.deepEqual(plannedUpdates(pending), [
    { patch: { category_id: 'streaming', is_fixed: true }, ids: ['a'] },
  ])
})

test('parcela nao separa a loja: "Air Europa 1/5" e "5/5" tem a mesma chave', async () => {
  const { normalizeDesc, parcelaDaDesc } = await import('./rules.ts')
  assert.equal(normalizeDesc('Air Europa 1/5'), normalizeDesc('Air Europa 5/5'))
  assert.equal(normalizeDesc('MERCADOLIVRE*7PRODUTO 8/10'), normalizeDesc('MERCADOLIVRE*7PRODUTO 9/10'))
  assert.equal(parcelaDaDesc('Air Europa 3/5'), '3/5')
  assert.equal(parcelaDaDesc('Seara Alimentos'), '')
  assert.equal(normalizeDesc('ALLIANZ SEGU*1 DE 10'), normalizeDesc('ALLIANZ SEGU*2 DE 10'))
  assert.equal(parcelaDaDesc('ALLIANZ SEGU*2 DE 10'), '2/10')
})
