import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  donoDe, baldeDoLaudo, porMes, mediana, foraDaCurva,
  parcelasAbertas, cronogramaParcelas, nomeCurto, type LaudoTx,
} from './laudo.ts'

const g = (o: Partial<LaudoTx> & { amount_cents: number; transaction_date: string }): LaudoTx => ({
  description: 'Loja', note: null, split_mine_pct: 50, is_fixed: null, fixed_bill_id: null,
  installment_number: null, total_installments: null, categoria: 'Mercado', ...o,
})

test('dono sai da divisão: 100 é só pessoa 1, 0 é só pessoa 2', () => {
  assert.equal(donoDe({ split_mine_pct: 100 }), 'nat')
  assert.equal(donoDe({ split_mine_pct: 0 }), 'jen')
  assert.equal(donoDe({ split_mine_pct: 75 }), 'juntos')
  assert.equal(donoDe({ split_mine_pct: null }), 'sem')
})

test('recorrente ganha do corte de valor — aluguel caro não vira evento', () => {
  const aluguel = g({ amount_cents: -657846, transaction_date: '2026-08-08', is_fixed: true })
  assert.equal(baldeDoLaudo(aluguel), 'recorrente')
  const carro = g({ amount_cents: -10400000, transaction_date: '2026-07-28' })
  assert.equal(baldeDoLaudo(carro), 'extraordinario')
  assert.equal(baldeDoLaudo(g({ amount_cents: -4500, transaction_date: '2026-07-01' })), 'rotina')
})

test('o extraordinário NÃO entra no teto', () => {
  const [m] = porMes([
    g({ amount_cents: -657846, transaction_date: '2026-08-08', is_fixed: true }),
    g({ amount_cents: -10000, transaction_date: '2026-08-09' }),
    g({ amount_cents: -10400000, transaction_date: '2026-08-28' }),
  ])
  assert.equal(m.recorrente, 657846)
  assert.equal(m.rotina, 10000)
  assert.equal(m.extraordinario, 10400000)
  assert.equal(m.noTeto, 667846, 'teto = recorrente + rotina, sem o carro')
})

test('porMes separa por dono e vem ordenado', () => {
  const ms = porMes([
    g({ amount_cents: -100, transaction_date: '2026-09-01', split_mine_pct: 100 }),
    g({ amount_cents: -200, transaction_date: '2026-08-01', split_mine_pct: 0 }),
    g({ amount_cents: -300, transaction_date: '2026-08-15', split_mine_pct: 50 }),
  ])
  assert.deepEqual(ms.map((m) => m.mes), ['2026-08', '2026-09'])
  assert.equal(ms[0].porDono.jen, 200)
  assert.equal(ms[0].porDono.juntos, 300)
  assert.equal(ms[1].porDono.nat, 100)
})

test('mediana com par e ímpar, e lista vazia', () => {
  assert.equal(mediana([]), 0)
  assert.equal(mediana([5]), 5)
  assert.equal(mediana([1, 2, 3]), 2)
  assert.equal(mediana([1, 2, 3, 4]), 3) // arredonda (2+3)/2 = 2,5 → 3
})

test('fora da curva é relativo à categoria, não ao valor absoluto', () => {
  const txs = [
    ...Array.from({ length: 8 }, (_, i) =>
      g({ amount_cents: -657846, transaction_date: `2026-0${i + 1}-08`, is_fixed: true, categoria: 'Moradia' })),
    ...Array.from({ length: 8 }, (_, i) =>
      g({ amount_cents: -11000, transaction_date: `2026-0${i + 1}-10`, categoria: 'Alimentação' })),
    g({ amount_cents: -73676, transaction_date: '2026-07-15', categoria: 'Alimentação', description: 'Mestiço' }),
  ]
  const out = foraDaCurva(txs)
  const nomes = out.map((o) => o.tx.description)
  assert.ok(nomes.includes('Mestiço'), 'restaurante de R$ 737 num típico de R$ 110 é anomalia')
  assert.equal(out.filter((o) => o.tx.categoria === 'Moradia').length, 0,
    'aluguel igual todo mês não é anomalia, mesmo sendo 60x maior')
})

test('categoria com menos de 4 gastos não gera anomalia', () => {
  const out = foraDaCurva([
    g({ amount_cents: -500000, transaction_date: '2026-03-01', categoria: 'Nova' }),
    g({ amount_cents: -1000, transaction_date: '2026-03-02', categoria: 'Nova' }),
    g({ amount_cents: -1000, transaction_date: '2026-03-03', categoria: 'Nova' }),
  ])
  assert.equal(out.length, 0)
})

test('gasto pequeno não vira anomalia mesmo com desvio alto', () => {
  const txs = [
    ...Array.from({ length: 8 }, (_, i) => g({ amount_cents: -100, transaction_date: `2026-0${i + 1}-01`, categoria: 'Jogos' })),
    g({ amount_cents: -40000, transaction_date: '2026-09-02', categoria: 'Jogos', description: 'DLC' }),
  ]
  assert.equal(foraDaCurva(txs).length, 0, 'R$ 400 está abaixo do piso de R$ 500')
})

const parc = (i: number, n: number, cents: number, date: string, desc = 'Mercado Livre') =>
  g({ amount_cents: -cents, transaction_date: date, installment_number: i, total_installments: n, description: desc })

test('parcela aberta: falta o que vem depois da última vista', () => {
  const [p] = parcelasAbertas([
    parc(1, 10, 56190, '2026-02-01'), parc(2, 10, 56190, '2026-03-01'), parc(3, 10, 56190, '2026-04-01'),
  ])
  assert.equal(p.posicao, 3)
  assert.equal(p.faltam, 7)
  assert.equal(p.aPagar, 7 * 56190)
})

test('plano quitado some da lista', () => {
  assert.deepEqual(parcelasAbertas([parc(1, 2, 10000, '2026-07-01'), parc(2, 2, 10000, '2026-08-01')]), [])
})

test('centavos diferentes na mesma compra não viram dois planos', () => {
  // EmmaSleep: 1/12 saiu R$ 393,22 e as seguintes R$ 393,14
  const abertas = parcelasAbertas([
    parc(1, 12, 39322, '2026-02-04', 'EC *EmmaSleep'),
    parc(2, 12, 39314, '2026-03-01', 'EC          *EMMASLEEP'),
    parc(7, 12, 39314, '2026-08-01', 'EC *EmmaSleep 7/12'),
  ])
  assert.equal(abertas.length, 1, 'é uma compra só')
  assert.equal(abertas[0].faltam, 5)
})

test('planos simultâneos da mesma loja com valores distintos ficam separados', () => {
  const abertas = parcelasAbertas([
    parc(1, 10, 54603, '2026-01-15', 'MAISLASER'),
    parc(8, 10, 54603, '2026-08-15', 'MAISLASER'),
    parc(7, 10, 41175, '2026-08-15', 'MAISLASER'),
  ])
  assert.equal(abertas.length, 2)
  assert.deepEqual(abertas.map((p) => p.faltam).sort(), [2, 3])
})

test('cronograma joga cada parcela restante no mês dela e ignora o passado', () => {
  const abertas = parcelasAbertas([parc(8, 10, 56190, '2026-09-01')])
  const c = cronogramaParcelas(abertas, '2026-10')
  assert.deepEqual(c, [{ mes: '2026-10', total: 56190 }, { mes: '2026-11', total: 56190 }])
})

test('cronograma vira o ano', () => {
  const abertas = parcelasAbertas([parc(1, 4, 10000, '2026-11-10')])
  assert.deepEqual(cronogramaParcelas(abertas, '2026-12').map((x) => x.mes),
    ['2026-12', '2027-01', '2027-02'])
})

test('nome curto: a observação vence descrição genérica', () => {
  assert.equal(nomeCurto({ description: 'Transferência enviada', note: 'Jardineiro' }), 'Jardineiro')
  assert.equal(nomeCurto({ description: 'Transferência enviada|CARLOS GOMES', note: null }), 'CARLOS GOMES')
  assert.equal(nomeCurto({ description: 'Cobasi Cotia', note: 'ração' }), 'Cobasi Cotia')
  assert.equal(nomeCurto({ description: null, note: null }), 'sem nome')
})

test('centavo que cruza o real não parte a compra em duas — LATAM 1/4 R$ 2.466,51 e 2/4 R$ 2.466,49', () => {
  // bug real: arredondar o valor pra reais punha 2.466,51 em "2467" e 2.466,49
  // em "2466", então a compra quitada aparecia com 3 parcelas em aberto
  const abertas = parcelasAbertas([
    parc(1, 4, 246651, '2026-04-10', 'Latam Air*Levsrg'),
    parc(2, 4, 246649, '2026-05-02', 'Latam Air*Levsrg'),
    parc(3, 4, 246649, '2026-06-11', 'LATAM AIR*LEVSRG'),
    parc(4, 4, 246649, '2026-07-11', 'LATAM AIR*LEVSRG'),
  ])
  assert.deepEqual(abertas, [], 'está toda paga')
})

test('mas valores realmente distintos continuam sendo planos distintos', () => {
  const abertas = parcelasAbertas([
    parc(2, 10, 54603, '2026-08-15', 'MAISLASER'),
    parc(2, 10, 41175, '2026-08-15', 'MAISLASER'),
  ])
  assert.equal(abertas.length, 2, 'R$ 546,03 e R$ 411,75 são compras diferentes')
})

test('o nome do parcelamento não carrega o "3/5" no fim', () => {
  const [p] = parcelasAbertas([parc(3, 5, 70000, '2026-08-27', 'Idm Instituto de Diagn 3/5')])
  assert.equal(p.nome, 'Idm Instituto de Diagn')
})

/* ───────── as cinco naturezas ───────── */
import { naturezaDe, porNatureza, NATUREZA_LABEL } from './laudo.ts'

const CONTAS = new Map([
  ['b-aluguel', 'Aluguel'], ['b-luz', 'Luz'], ['b-agua', 'Água'],
  ['b-cond', 'Condomínio'], ['b-net', 'Internet'],
  ['b-diarista', 'Diarista'], ['b-piscina', 'Piscineiro'], ['b-jardim', 'Jardineiro'],
])
const nat = (t: LaudoTx) => naturezaDe(t, t.fixed_bill_id ? CONTAS.get(t.fixed_bill_id) : undefined)

test('fixo é a conta inegociável; serviço e pessoa são quase fixo', () => {
  const conta = (id: string) => nat(g({ amount_cents: -30000, transaction_date: '2026-08-08', categoria: 'Moradia', fixed_bill_id: id }))
  for (const id of ['b-aluguel', 'b-luz', 'b-agua', 'b-cond', 'b-net']) assert.equal(conta(id), 'fixo', id)
  for (const id of ['b-diarista', 'b-piscina', 'b-jardim']) assert.equal(conta(id), 'quaseFixo', id)
})

test('conta fixa nova nasce quase fixo — inegociável não se assume por omissão', () => {
  assert.equal(naturezaDe(g({ amount_cents: -30000, transaction_date: '2026-08-08', fixed_bill_id: 'b-novo' }), 'Professor de violão'), 'quaseFixo')
})

test('flexível é o que muda todo mês e não dá pra parar', () => {
  const c = (cat: string) => nat(g({ amount_cents: -20000, transaction_date: '2026-08-01', categoria: cat }))
  for (const cat of ['Mercado', 'Alimentação', 'Delivery', 'Gatos', 'Fitness', 'Saúde']) assert.equal(c(cat), 'flexivel', cat)
})

test('assinatura é streaming e ferramenta — fitness saiu, virou flexível', () => {
  const c = (cat: string) => nat(g({ amount_cents: -3000, transaction_date: '2026-08-01', categoria: cat }))
  assert.equal(c('Ferramentas'), 'assinatura')
  assert.equal(c('Streaming/Entretenimento'), 'assinatura')
  assert.equal(c('Armazenamento'), 'assinatura')
  assert.equal(c('Fitness'), 'flexivel', 'personal muda de mês pra mês')
})

test('parcelado vence tudo — móvel em 12x é parcelado, não "casa"', () => {
  const movel = g({ amount_cents: -39314, transaction_date: '2026-08-01', categoria: 'Moradia', installment_number: 7, total_installments: 12 })
  assert.equal(nat(movel), 'parcelado')
  const tapete = g({ amount_cents: -20000, transaction_date: '2026-08-01', categoria: 'Mercado', installment_number: 1, total_installments: 3 })
  assert.equal(nat(tapete), 'parcelado', 'mesmo numa categoria flexível')
})

test('compra à vista não é parcelado', () => {
  assert.equal(nat(g({ amount_cents: -20000, transaction_date: '2026-08-01', categoria: 'Roupas', total_installments: 1 })), 'variavel')
  assert.equal(nat(g({ amount_cents: -20000, transaction_date: '2026-08-01', categoria: 'Roupas' })), 'variavel')
})

test('o que não foi nomeado cai em "variável", nunca some', () => {
  const c = (cat: string) => nat(g({ amount_cents: -20000, transaction_date: '2026-08-01', categoria: cat }))
  for (const cat of ['Roupas', 'Lazer', 'Viagem', 'Compras online', 'Beauty', 'Transporte']) assert.equal(c(cat), 'variavel', cat)
})

test('a matriz soma tudo e detalha o que tem dentro', () => {
  const linhas = porNatureza([
    g({ amount_cents: -657846, transaction_date: '2026-08-08', categoria: 'Moradia', fixed_bill_id: 'b-aluguel' }),
    g({ amount_cents: -75000, transaction_date: '2026-08-13', categoria: 'Moradia', fixed_bill_id: 'b-diarista' }),
    g({ amount_cents: -30000, transaction_date: '2026-08-05', categoria: 'Mercado', description: 'Hortifruti' }),
    g({ amount_cents: -20000, transaction_date: '2026-08-06', categoria: 'Mercado', description: 'HORTIFRUTI' }),
  ], ['2026-08'], CONTAS)
  const total = linhas.reduce((s, l) => s + l.total, 0)
  assert.equal(total, 657846 + 75000 + 50000, 'nada se perde')
  const flex = linhas.find((l) => l.natureza === 'flexivel')!
  assert.equal(flex.itens.length, 1, 'as duas grafias do hortifruti são o mesmo item')
  assert.equal(flex.itens[0].total, 50000)
  assert.equal(NATUREZA_LABEL[linhas[0].natureza], 'Fixo')
})

test('o mês em curso não entra no típico da natureza', () => {
  const linhas = porNatureza([
    g({ amount_cents: -30000, transaction_date: '2026-07-05', categoria: 'Mercado' }),
    g({ amount_cents: -30000, transaction_date: '2026-08-05', categoria: 'Mercado' }),
    g({ amount_cents: -2000, transaction_date: '2026-09-02', categoria: 'Mercado' }),
  ], ['2026-07', '2026-08', '2026-09'], CONTAS, '2026-09')
  assert.equal(linhas[0].tipico, 30000)
  assert.equal(linhas[0].total, 62000)
})

/* ───────── compromissos mensais ───────── */
import { compromissosMensais, chaveDeComerciante, MESES_PRA_SER_MENSAL } from './laudo.ts'

const mensal = (nome: string, cents: number, meses: number, cat = 'Ferramentas', extra: Partial<LaudoTx> = {}) =>
  Array.from({ length: meses }, (_, i) =>
    g({ amount_cents: -cents, transaction_date: `2026-0${i + 1}-09`, description: nome, categoria: cat, ...extra }))

test('grafias diferentes da mesma marca viram uma cobrança só', () => {
  assert.equal(chaveDeComerciante({ description: 'Ebn *Adobe', note: null }), 'Adobe')
  assert.equal(chaveDeComerciante({ description: 'ADOBE *ADOBE', note: null }), 'Adobe')
  assert.equal(chaveDeComerciante({ description: 'EBN*SPOTIFY', note: null }), 'Spotify')
  assert.equal(chaveDeComerciante({ description: 'Spotify Família', note: null }), 'Spotify')
})

test('loja desconhecida junta por caixa — "Minuto Pa" e "MINUTO PA" é a mesma', () => {
  assert.equal(
    chaveDeComerciante({ description: 'Minuto Pa-2215', note: null }),
    chaveDeComerciante({ description: 'MINUTO PA-2215', note: null }),
  )
})

test('acha o que cobra todo mês e não é conta fixa', () => {
  const c = compromissosMensais(mensal('Ebn *Adobe', 32000, 8), '2026-09')
  assert.equal(c.length, 1)
  assert.equal(c[0].nome, 'Adobe')
  assert.equal(c[0].porMes, 32000)
  assert.equal(c[0].meses, 8)
})

test('menos de 5 meses não é mensal ainda', () => {
  assert.equal(compromissosMensais(mensal('Ebn *Adobe', 32000, MESES_PRA_SER_MENSAL - 1), '2026-09').length, 0)
})

test('conta fixa cadastrada fica de fora — já aparece em outro lugar', () => {
  const c = compromissosMensais(mensal('Aluguel', 657846, 8, 'Moradia', { fixed_bill_id: 'x' }), '2026-09')
  assert.equal(c.length, 0)
})

test('parcelamento não é compromisso mensal — tem fim', () => {
  const parcelas = Array.from({ length: 6 }, (_, i) =>
    g({ amount_cents: -50000, transaction_date: `2026-0${i + 1}-01`, description: 'Loja', categoria: 'Outros',
        installment_number: i + 1, total_installments: 10 }))
  assert.equal(compromissosMensais(parcelas, '2026-09').length, 0)
})

test('mercado e iFood repetem, mas não são compromisso', () => {
  const txs = [...mensal('Supermercado', 30000, 8, 'Mercado'), ...mensal('iFood', 9000, 8, 'Delivery')]
  assert.equal(compromissosMensais(txs, '2026-09').length, 0, 'cada compra dessas é uma decisão')
})

test('marca como inativo o que parou de cobrar', () => {
  const c = compromissosMensais([
    ...mensal('GoPerl', 26900, 5, 'Fitness'),   // jan a mai
    ...mensal('Ebn *Adobe', 32000, 8),          // jan a ago
  ], '2026-09')
  assert.equal(c.find((x) => x.nome === 'GoPerl')!.ativo, false)
  assert.equal(c.find((x) => x.nome === 'Adobe')!.ativo, true, 'cobrou em agosto, o mês passado')
})

test('vem ordenado do mais caro por mês', () => {
  const c = compromissosMensais([
    ...mensal('ChatGPT', 2000, 8), ...mensal('Ebn *Adobe', 32000, 8), ...mensal('Netflix', 5990, 8, 'Streaming/Entretenimento'),
  ], '2026-09')
  assert.deepEqual(c.map((x) => x.nome), ['Adobe', 'Netflix', 'ChatGPT'])
})
