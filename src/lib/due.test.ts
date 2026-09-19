// src/lib/due.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diasNoMes, vencimentoNoMes, diaDeCobranca, prazoFinal, somaDias, diasEntre,
  statusDaConta, precisaPagarAgora, contasAPagar, faturasAPagar, valoresTipicos,
} from './due.ts'

/* ───────────────────────────── datas cruas ───────────────────────────── */

test('dias no mes cobre 30, 31, fevereiro e bissexto', () => {
  assert.equal(diasNoMes('2026-04'), 30)
  assert.equal(diasNoMes('2026-01'), 31)
  assert.equal(diasNoMes('2026-02'), 28)
  assert.equal(diasNoMes('2028-02'), 29)
})

test('vence dia 31 em mes de 30 dias cai no ultimo dia', () => {
  assert.equal(vencimentoNoMes(31, '2026-04'), '2026-04-30')
  assert.equal(vencimentoNoMes(31, '2026-05'), '2026-05-31')
})

test('vence dia 31 em fevereiro cai no ultimo dia (e no 29 no bissexto)', () => {
  assert.equal(vencimentoNoMes(31, '2026-02'), '2026-02-28')
  assert.equal(vencimentoNoMes(30, '2026-02'), '2026-02-28')
  assert.equal(vencimentoNoMes(31, '2028-02'), '2028-02-29')
})

test('dia fora da faixa nao quebra', () => {
  assert.equal(vencimentoNoMes(0, '2026-09'), '2026-09-01')
  assert.equal(vencimentoNoMes(99, '2026-09'), '2026-09-30')
})

test('soma e diferenca de dias atravessam mes e ano', () => {
  assert.equal(somaDias('2026-01-31', 1), '2026-02-01')
  assert.equal(somaDias('2026-03-01', -1), '2026-02-28')
  assert.equal(somaDias('2026-12-31', 1), '2027-01-01')
  assert.equal(diasEntre('2026-09-10', '2026-09-15'), 5)
  assert.equal(diasEntre('2026-09-15', '2026-09-10'), -5)
})

/* ─────────────────────── vencimento em fim de semana ─────────────────────── */
// Regra: o EMPURRAO antecipa (pague na sexta, banco nao processa no sabado) e o
// ATRASO e generoso (boleto de sabado/domingo se paga na segunda sem multa).
// Antecipar o aviso e adiar a bronca — nunca o contrario.

test('vencimento no domingo: cobra na sexta, atrasa depois da segunda', () => {
  // 2026-11-15 e domingo; 13 e sexta; 16 e segunda.
  assert.equal(vencimentoNoMes(15, '2026-11'), '2026-11-15')
  assert.equal(diaDeCobranca(15, '2026-11'), '2026-11-13')
  assert.equal(prazoFinal(15, '2026-11'), '2026-11-16')
})

test('vencimento no sabado: cobra na sexta, prazo vai pra segunda', () => {
  // 2026-02-28 e sabado; 27 e sexta; 2026-03-02 e segunda.
  assert.equal(diaDeCobranca(28, '2026-02'), '2026-02-27')
  assert.equal(prazoFinal(28, '2026-02'), '2026-03-02')
})

test('vencimento em dia util nao mexe em nada', () => {
  // 2026-09-15 e terca.
  assert.equal(diaDeCobranca(15, '2026-09'), '2026-09-15')
  assert.equal(prazoFinal(15, '2026-09'), '2026-09-15')
})

test('dia 1 no fim de semana nao antecipa pro mes anterior', () => {
  // 2026-03-01 e domingo. Antecipar levaria pra 27/02 — outro mes, outra conta.
  assert.equal(diaDeCobranca(1, '2026-03'), '2026-03-01')
  assert.equal(prazoFinal(1, '2026-03'), '2026-03-02')
  // 2026-08-01 e sabado.
  assert.equal(diaDeCobranca(1, '2026-08'), '2026-08-01')
  assert.equal(prazoFinal(1, '2026-08'), '2026-08-03')
})

/* ────────────────────────────── status da conta ────────────────────────────── */

const base = { dueDay: 15, mes: '2026-09', hoje: '2026-09-10', paid: false, manual: false }

test('vence daqui a 5 dias: vence essa semana', () => {
  assert.equal(statusDaConta(base), 'semana')
})

test('vence hoje', () => {
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-15' }), 'hoje')
})

test('passou do prazo e nao caiu: atrasada', () => {
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-16' }), 'atrasada')
})

test('vence muito longe: futura, e nao aparece no empurrao', () => {
  assert.equal(statusDaConta({ ...base, dueDay: 28 }), 'futura')
  assert.equal(precisaPagarAgora('futura'), false)
})

test('conta ja paga nao alerta, nem no dia do vencimento', () => {
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-15', paid: true }), 'paga')
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-20', paid: true }), 'paga')
  assert.equal(precisaPagarAgora('paga'), false)
})

test('conta paga adiantada nao vira "vence essa semana"', () => {
  // pagou dia 3 uma conta que vence dia 15: nada a cobrar.
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-10', paid: true }), 'paga')
})

test('conta resolvida na mao nao alerta', () => {
  // pagamento caiu em outro mes / fora das contas rastreadas (fixed_bill_marks)
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-20', manual: true }), 'resolvida')
  assert.equal(precisaPagarAgora('resolvida'), false)
})

test('conta sem dia cadastrado nao pode ser chamada de atrasada', () => {
  assert.equal(statusDaConta({ ...base, dueDay: null, hoje: '2026-09-28' }), 'sem_dia')
  assert.equal(precisaPagarAgora('sem_dia'), false)
})

test('mes passado que nao caiu: nao_caiu, sem empurrao', () => {
  assert.equal(statusDaConta({ ...base, mes: '2026-08' }), 'nao_caiu')
  assert.equal(precisaPagarAgora('nao_caiu'), false)
})

test('mes que vem nunca esta atrasado', () => {
  assert.equal(statusDaConta({ ...base, mes: '2026-10' }), 'futura')
})

test('mes fechado nao cobra nada', () => {
  // fechamento assinado: reabrir a cobranca ali so gera ruido.
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-28', fechado: true }), 'nao_caiu')
  assert.equal(statusDaConta({ ...base, hoje: '2026-09-28', fechado: true, paid: true }), 'paga')
})

test('vencimento no domingo: empurra na sexta e ainda na segunda, atrasa na terca', () => {
  const dom = { dueDay: 15, mes: '2026-11', paid: false, manual: false }
  assert.equal(statusDaConta({ ...dom, hoje: '2026-11-12' }), 'semana')  // quinta
  assert.equal(statusDaConta({ ...dom, hoje: '2026-11-13' }), 'hoje')    // sexta
  assert.equal(statusDaConta({ ...dom, hoje: '2026-11-15' }), 'hoje')    // domingo
  assert.equal(statusDaConta({ ...dom, hoje: '2026-11-16' }), 'hoje')    // segunda
  assert.equal(statusDaConta({ ...dom, hoje: '2026-11-17' }), 'atrasada')// terca
})

test('atrasada e vence hoje sao os dois unicos que empurram', () => {
  assert.equal(precisaPagarAgora('atrasada'), true)
  assert.equal(precisaPagarAgora('hoje'), true)
  assert.equal(precisaPagarAgora('semana'), false)
})

/* ──────────────────────────── lista pra tela ──────────────────────────── */

const bills = [
  { id: 'luz',   label: 'Luz',      emoji: '💡', dueDay: 15,   paid: false, manual: false, amount: 0,      typical: 32000 },
  { id: 'net',   label: 'Internet', emoji: '🌐', dueDay: 5,    paid: false, manual: false, amount: 0,      typical: 12000 },
  { id: 'alug',  label: 'Aluguel',  emoji: '🏠', dueDay: 10,   paid: true,  manual: false, amount: 250000, typical: 250000 },
  { id: 'agua',  label: 'Água',     emoji: '🚿', dueDay: 12,   paid: false, manual: false, amount: 0,      typical: 9000 },
  { id: 'jard',  label: 'Jardineiro', emoji: '🌳', dueDay: null, paid: false, manual: false, amount: 0,    typical: 20000 },
]

test('lista poe atrasada primeiro, depois hoje, depois a semana', () => {
  // hoje = 12/09 (sabado): Internet (dia 5) atrasou; Agua vence 12 -> sexta 11 ja cobrava
  const out = contasAPagar(bills, { mes: '2026-09', hoje: '2026-09-12' })
  assert.deepEqual(out.map((c) => [c.id, c.status]), [
    ['net', 'atrasada'],
    ['agua', 'hoje'],
    ['luz', 'semana'],
    ['jard', 'sem_dia'],
    ['alug', 'paga'],
  ])
})

test('lista traz vencimento e dias que faltam', () => {
  const out = contasAPagar(bills, { mes: '2026-09', hoje: '2026-09-10' })
  const luz = out.find((c) => c.id === 'luz')!
  assert.equal(luz.vencimento, '2026-09-15')
  assert.equal(luz.diasAte, 5)
  const jard = out.find((c) => c.id === 'jard')!
  assert.equal(jard.vencimento, null)
  assert.equal(jard.diasAte, null)
})

test('mes fechado: ninguem na lista precisa pagar agora', () => {
  const out = contasAPagar(bills, { mes: '2026-09', hoje: '2026-09-28', fechado: true })
  assert.equal(out.filter((c) => precisaPagarAgora(c.status)).length, 0)
})

/* ──────────────────────────── fatura do cartao ──────────────────────────── */

test('fatura que vence essa semana entra; a que ja passou nao vira atrasada', () => {
  // A Pluggy rola o balance_due_date pra frente depois do pagamento, entao data
  // no passado NAO prova atraso — chamar de atrasada seria mentira.
  const out = faturasAPagar([
    { id: 'nu', name: 'Nubank', dueDate: '2026-09-14', amount: 480000 },
    { id: 'in', name: 'Inter',  dueDate: '2026-09-01', amount: 120000 },
    { id: 'xp', name: 'XP',     dueDate: null,         amount: 0 },
  ], '2026-09-10')

  assert.deepEqual(out.map((f) => [f.id, f.status]), [['nu', 'semana'], ['in', 'futura']])
  assert.equal(out[0].diasAte, 4)
})

test('fatura que vence hoje empurra', () => {
  const out = faturasAPagar([{ id: 'nu', name: 'Nubank', dueDate: '2026-09-10', amount: 480000 }], '2026-09-10')
  assert.equal(out[0].status, 'hoje')
  assert.equal(precisaPagarAgora(out[0].status), true)
})

/* ──────────────────────────── valor tipico ──────────────────────────── */

test('valor tipico e a media do historico, em centavos inteiros', () => {
  const v = valoresTipicos([
    { fixed_bill_id: 'luz', amount_cents: -30000 },
    { fixed_bill_id: 'luz', amount_cents: -32001 },
    { fixed_bill_id: null, amount_cents: -9999 },
  ])
  assert.equal(v.get('luz'), 31001)
  assert.equal(Number.isInteger(v.get('luz')), true)
  assert.equal(v.has('net'), false)
})

test('sem historico nao inventa valor tipico', () => {
  assert.equal(valoresTipicos([]).size, 0)
})

test('palpite atravessa a lista sem mudar a regra de data', () => {
  // Conta sem dia cadastrado cai no dia aprendido, mas marcada como palpite —
  // a tela e o e-mail precisam poder dizer "~dia 20" em vez de "dia 20".
  const out = contasAPagar(
    [{ id: 'luz', label: 'Luz', emoji: '💡', dueDay: 15, palpite: true, paid: false, manual: false, amount: 0, typical: 0 }],
    { mes: '2026-09', hoje: '2026-09-15' },
  )
  assert.equal(out[0].palpite, true)
  assert.equal(out[0].status, 'hoje')
})
