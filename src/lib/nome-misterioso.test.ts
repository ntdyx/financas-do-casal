// src/lib/nome-misterioso.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinatario, pareceNomeDePessoa, misteriosos, type MistTx } from './nome-misterioso.ts'

const tx = (description: string, extra: Partial<MistTx> = {}): MistTx => ({
  id: description, description, note: null, categoria: 'Moradia', ...extra,
})

test('destinatario: pega o nome depois do "|"', () => {
  assert.equal(destinatario('Transferência enviada|José Irenio Moreira Silva'), 'José Irenio Moreira Silva')
  assert.equal(destinatario('ENEL SP'), 'ENEL SP')
})

test('pareceNomeDePessoa: pessoa sim, empresa não', () => {
  assert.equal(pareceNomeDePessoa('José Irenio Moreira Silva'), true)
  assert.equal(pareceNomeDePessoa('MAYARA CRISTINA DE OLIVEIRA'), true)
  assert.equal(pareceNomeDePessoa('Thaís Soares Pereira'), true)
  assert.equal(pareceNomeDePessoa('COPY LASER COMERCIAL LTDA'), false)
  assert.equal(pareceNomeDePessoa('MED PL SERVICOS MEDICOS S/S'), false)
  assert.equal(pareceNomeDePessoa('TIM S A'), false)
  assert.equal(pareceNomeDePessoa('COLORIDAMENTE'), false)
  assert.equal(pareceNomeDePessoa('JULIANA G. DE MOURA MASS COPIADORA'), false)
  assert.equal(pareceNomeDePessoa('BANCO GM SA'), false)
})

test('misteriosos: Pix pra pessoa sem observacao entra', () => {
  const r = misteriosos([tx('Transferência enviada|MAYARA CRISTINA DE OLIVEIRA')], [])
  assert.equal(r.length, 1)
})

test('misteriosos: com observacao nao entra', () => {
  const r = misteriosos([tx('Transferência enviada|MAYARA CRISTINA DE OLIVEIRA', { note: 'bolo' })], [])
  assert.equal(r.length, 0)
})

test('misteriosos: pessoa ja explicada antes (mesmo nome, com observacao) nao entra', () => {
  const r = misteriosos(
    [tx('Transferência enviada|José Irenio Moreira Silva')],
    [{ description: 'Transferência enviada|JOSE IRENIO MOREIRA SILVA', note: 'jardineiro' }],
  )
  assert.equal(r.length, 0)
})

test('misteriosos: intermediador de pagamento entra', () => {
  const r = misteriosos([
    tx('Transferência enviada|PAY2ALL INSTITUICAO DE PAGAMENTO LTDA.'),
    tx('Transferência enviada|SF PAGAMENTOS LTDA'),
  ], [])
  assert.equal(r.length, 2)
})

test('misteriosos: empresa em categoria generica (Transferências/Outros) entra', () => {
  const r = misteriosos([
    tx('Transferência enviada|SYNC TICKET BR LTDA', { categoria: 'Transferências' }),
    tx('Transferência enviada|JV PRINT PAPELARIA LTDA', { categoria: 'Outros' }),
  ], [])
  assert.equal(r.length, 2)
})

test('misteriosos: empresa com categoria de verdade nao entra', () => {
  const r = misteriosos([
    tx('Transferência enviada|COLORIDAMENTE', { categoria: 'Saúde' }),
    tx('Pagamento efetuado|NMULTIFIBRA'),
  ], [])
  assert.equal(r.length, 0)
})

test('misteriosos: compra de cartao so entra se estiver sem categoria', () => {
  const r = misteriosos([
    tx('SACOLAO SAUDE', { categoria: 'Mercado' }),
    tx('Understandmyself', { categoria: 'Outros' }),
    tx('Pop 05set 20h57min', { categoria: null }),
  ], [])
  assert.deepEqual(r.map((t) => t.description), ['Pop 05set 20h57min'])
})

test('misteriosos: boleto e tarifa do banco nao entram', () => {
  const r = misteriosos([
    tx('Pagamento efetuado|SAO PAULO II'),
    tx('Juros de Mora', { categoria: null }),
    tx('Multa Contratual', { categoria: null }),
  ], [])
  assert.equal(r.length, 0)
})
