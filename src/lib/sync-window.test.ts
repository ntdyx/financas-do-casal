// src/lib/sync-window.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncFrom, splitNewAndExisting, matchReplacedIds, dedupeIncoming } from './sync-window.ts'

test('janela cobre os ultimos 90 dias mesmo com sync de ontem', () => {
  // o cartao lanca com atraso: compra do dia 19 nasce na Pluggy no dia 21.
  // com janela [ultimo sync..hoje] ela cai fora e some pra sempre.
  const from = syncFrom('2026-08-20T00:18:00Z', new Date('2026-08-21T00:19:00Z'))
  assert.equal(from, '2026-05-23')
})

test('sync parado ha meses busca desde o ultimo sync, nao so 90 dias', () => {
  const from = syncFrom('2026-01-10T03:00:00Z', new Date('2026-08-21T00:19:00Z'))
  assert.equal(from, '2026-01-10')
})

test('primeiro sync (sem historico) usa a janela padrao', () => {
  const from = syncFrom(null, new Date('2026-08-21T00:19:00Z'))
  assert.equal(from, '2026-05-23')
})

test('re-sync nao sobrescreve o payer editado na mao', () => {
  const rows = [
    { pluggy_transaction_id: 'ja-existe', payer: 'me', amount_cents: -100 },
    { pluggy_transaction_id: 'nova', payer: 'me', amount_cents: -200 },
  ]

  const { inserts, updates } = splitNewAndExisting(rows, new Set(['ja-existe']))

  assert.deepEqual(inserts.map((r) => r.pluggy_transaction_id), ['nova'])
  assert.equal(updates.length, 1)
  assert.equal('payer' in updates[0], false, 'payer nao pode entrar no update')
  assert.equal(updates[0].amount_cents, -100)
})

/* ─────────── PENDING → POSTED: a Pluggy troca o id do lançamento ─────────── */

const pl = (id: string, d: string, c: number, desc: string) =>
  ({ id, transaction_date: d, amount_cents: c, description: desc })
const bd = (id: string, d: string, c: number, desc: string) =>
  ({ pluggy_transaction_id: id, transaction_date: d, amount_cents: c, description: desc })

test('casa o lancamento que trocou de id em vez de duplicar', () => {
  // O banco tem a versao PENDING (id antigo); a Pluggy agora so reporta a
  // POSTED (id novo). Sem casar, o upsert insere uma segunda linha.
  const mapa = matchReplacedIds(
    [pl('novo-1', '2026-06-14', -2500, 'Marta Patisserie')],
    [bd('velho-1', '2026-06-14', -2500, 'Marta Patisserie')],
  )
  assert.equal(mapa.get('velho-1'), 'novo-1')
})

test('nao casa quando a Pluggy ainda reporta o id antigo', () => {
  // Se os dois ids vem na resposta, sao dois lancamentos distintos que por
  // acaso batem em data/valor/descricao — nao pode fundir.
  const mapa = matchReplacedIds(
    [pl('velho-1', '2026-06-14', -2500, 'Cafe'), pl('novo-1', '2026-06-14', -2500, 'Cafe')],
    [bd('velho-1', '2026-06-14', -2500, 'Cafe')],
  )
  assert.equal(mapa.size, 0)
})

test('ambiguidade (2 candidatos pro mesmo par) nao casa nada', () => {
  const mapa = matchReplacedIds(
    [pl('n1', '2026-06-14', -2500, 'Cafe'), pl('n2', '2026-06-14', -2500, 'Cafe')],
    [bd('v1', '2026-06-14', -2500, 'Cafe'), bd('v2', '2026-06-14', -2500, 'Cafe')],
  )
  assert.equal(mapa.size, 0)
})

test('data, valor ou descricao diferentes nao casam', () => {
  assert.equal(matchReplacedIds([pl('n', '2026-06-15', -2500, 'Cafe')], [bd('v', '2026-06-14', -2500, 'Cafe')]).size, 0)
  assert.equal(matchReplacedIds([pl('n', '2026-06-14', -2600, 'Cafe')], [bd('v', '2026-06-14', -2500, 'Cafe')]).size, 0)
  assert.equal(matchReplacedIds([pl('n', '2026-06-14', -2500, 'Padaria')], [bd('v', '2026-06-14', -2500, 'Cafe')]).size, 0)
})

test('descricao casa por forma normalizada (maiuscula, LTDA, CNPJ)', () => {
  const mapa = matchReplacedIds(
    [pl('n', '2026-06-16', -10960, 'SEARA ALIMENTOS LTDA')],
    [bd('v', '2026-06-16', -10960, 'Seara Alimentos')],
  )
  assert.equal(mapa.get('v'), 'n')
})

/* ─────────── Pluggy devolve a MESMA linha duas vezes, com ids diferentes ─────────── */

const inc = (id: string, d: string, c: number, desc: string, status?: string) =>
  ({ pluggy_transaction_id: id, transaction_date: d, amount_cents: c, description: desc, raw: { status } })

test('colapsa duas linhas identicas da Pluggy numa so', () => {
  const { kept, dropped } = dedupeIncoming(
    [inc('a', '2026-07-02', 1427168, 'Pagamento recebido', 'POSTED'),
     inc('b', '2026-07-02', 1427168, 'Pagamento recebido', 'POSTED')],
    new Set(['a']),
  )
  // empate no status: fica quem ja esta no banco, pra nao trocar a linha a toa
  assert.deepEqual(kept.map((r) => r.pluggy_transaction_id), ['a'])
  assert.deepEqual(dropped.map((r) => r.pluggy_transaction_id), ['b'])
})

test('POSTED ganha de PENDING mesmo sendo a PENDING que esta no banco', () => {
  // Assim a POSTED vira a linha boa e o matchReplacedIds renomeia a antiga,
  // em vez de inserir uma segunda.
  const { kept } = dedupeIncoming(
    [inc('velha', '2026-08-03', 939548, 'Pagamento recebido', 'PENDING'),
     inc('nova', '2026-08-03', 939548, 'Pagamento recebido', 'POSTED')],
    new Set(['velha']),
  )
  assert.deepEqual(kept.map((r) => r.pluggy_transaction_id), ['nova'])
})

test('nao colapsa o que difere em data, valor ou descricao', () => {
  const { kept } = dedupeIncoming(
    [inc('a', '2026-07-02', -2500, 'Cafe', 'POSTED'),
     inc('b', '2026-07-03', -2500, 'Cafe', 'POSTED'),
     inc('c', '2026-07-02', -2600, 'Cafe', 'POSTED'),
     inc('d', '2026-07-02', -2500, 'Padaria', 'POSTED')],
    new Set(),
  )
  assert.equal(kept.length, 4)
})

test('empate sem nada no banco: escolha estavel (nao alterna entre syncs)', () => {
  const linhas = [inc('zzz', '2026-07-02', -2500, 'Cafe', 'POSTED'), inc('aaa', '2026-07-02', -2500, 'Cafe', 'POSTED')]
  const um = dedupeIncoming(linhas, new Set()).kept.map((r) => r.pluggy_transaction_id)
  const dois = dedupeIncoming([...linhas].reverse(), new Set()).kept.map((r) => r.pluggy_transaction_id)
  assert.deepEqual(um, dois)
})

test('nunca descarta as duas: sempre sobra uma por grupo', () => {
  const { kept, dropped } = dedupeIncoming(
    [inc('a', '2026-07-02', 1000, 'X'), inc('b', '2026-07-02', 1000, 'X'), inc('c', '2026-07-02', 1000, 'X')],
    new Set(),
  )
  assert.equal(kept.length, 1)
  assert.equal(dropped.length, 2)
})

test('parcelas diferentes da mesma loja, mesmo dia e valor, nao viram duplicata', () => {
  const pluggy = [{ id: 'novo', transaction_date: '2026-09-01', amount_cents: -1000, description: 'Loja 2/3' }]
  const banco = [{ pluggy_transaction_id: 'velho', transaction_date: '2026-09-01', amount_cents: -1000, description: 'Loja 1/3' }]
  assert.equal(matchReplacedIds(pluggy, banco).size, 0)
})
