import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchParcelaRemarcada, JANELA_PARCELA_DIAS } from './sync-parcela.ts'

const p = (id: string, date: string, cents: number, desc: string, i: number | null, n: number | null) =>
  ({ id, transaction_date: date, amount_cents: cents, description: desc, installment_number: i, total_installments: n })
const d = (pid: string, date: string, cents: number, desc: string, i: number | null, n: number | null) =>
  ({ pluggy_transaction_id: pid, transaction_date: date, amount_cents: cents, description: desc, installment_number: i, total_installments: n })

test('casa a mesma parcela remarcada pra outra data', () => {
  // foi o que duplicou de verdade: Leydaphoto 3/3 no banco em 24/07,
  // a Pluggy devolveu a MESMA parcela datada 02/07 com id novo
  const m = matchParcelaRemarcada(
    [p('novo', '2026-07-02', -132000, 'Mp*Leydaphoto 3/3', 3, 3)],
    [d('velho', '2026-07-24', -132000, 'Mp*Leydaphoto 3/3', 3, 3)],
  )
  assert.equal(m.get('velho'), 'novo')
})

test('NÃO casa parcelas diferentes do mesmo plano', () => {
  const m = matchParcelaRemarcada(
    [p('novo', '2026-08-02', -132000, 'Mp*Leydaphoto', 2, 3)],
    [d('velho', '2026-07-24', -132000, 'Mp*Leydaphoto', 3, 3)],
  )
  assert.equal(m.size, 0, 'parcela 2/3 não é a 3/3')
})

test('NÃO casa valores diferentes', () => {
  const m = matchParcelaRemarcada(
    [p('novo', '2026-07-02', -132001, 'Mp*Leydaphoto', 3, 3)],
    [d('velho', '2026-07-24', -132000, 'Mp*Leydaphoto', 3, 3)],
  )
  assert.equal(m.size, 0)
})

test('NÃO casa fora da janela — dois planos iguais em meses distantes existem', () => {
  // caso real: IDM 2/5 de R$ 700 em 01/07 e em 15/08, 45 dias de distância,
  // provavelmente dois tratamentos diferentes. Fundir apagaria gasto real.
  const m = matchParcelaRemarcada(
    [p('novo', '2026-08-15', -70000, 'Idm Instituto de Diagn', 2, 5)],
    [d('velho', '2026-07-01', -70000, 'Idm Instituto de Diagn', 2, 5)],
  )
  assert.equal(m.size, 0)
  assert.ok(JANELA_PARCELA_DIAS < 45, 'a janela tem que ser menor que esse intervalo')
})

test('ignora lançamento sem parcela', () => {
  const m = matchParcelaRemarcada(
    [p('novo', '2026-07-02', -5000, 'Padaria', null, null)],
    [d('velho', '2026-07-04', -5000, 'Padaria', null, null)],
  )
  assert.equal(m.size, 0, 'sem i/n não há identidade forte; deixa pro casamento por data exata')
})

test('só casa 1:1 — na dúvida não funde nada', () => {
  const m = matchParcelaRemarcada(
    [p('n1', '2026-07-02', -10000, 'Loja', 2, 4), p('n2', '2026-07-03', -10000, 'Loja', 2, 4)],
    [d('v1', '2026-07-20', -10000, 'Loja', 2, 4)],
  )
  assert.equal(m.size, 0)
})

test('não casa se a Pluggy ainda reporta o id antigo', () => {
  // se os dois ids vêm na resposta, são dois lançamentos distintos
  const m = matchParcelaRemarcada(
    [p('velho', '2026-07-24', -132000, 'Loja', 3, 3), p('novo', '2026-07-02', -132000, 'Loja', 3, 3)],
    [d('velho', '2026-07-24', -132000, 'Loja', 3, 3)],
  )
  assert.equal(m.size, 0)
})

test('a descrição é comparada normalizada (espaço e caixa não contam)', () => {
  const m = matchParcelaRemarcada(
    [p('novo', '2026-08-02', -39314, 'EC          *EMMASLEEP 7/12', 7, 12)],
    [d('velho', '2026-08-20', -39314, 'EC *EmmaSleep 7/12', 7, 12)],
  )
  assert.equal(m.get('velho'), 'novo')
})

test('mesma data também casa (não atrapalha o caminho normal)', () => {
  const m = matchParcelaRemarcada(
    [p('novo', '2026-07-24', -132000, 'Loja', 3, 3)],
    [d('velho', '2026-07-24', -132000, 'Loja', 3, 3)],
  )
  assert.equal(m.get('velho'), 'novo')
})
