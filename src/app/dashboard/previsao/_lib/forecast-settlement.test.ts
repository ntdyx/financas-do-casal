// src/app/dashboard/previsao/_lib/forecast-settlement.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forecastSettlement } from './forecast-settlement.ts'

test('soma divididos reais com o piso de fixas divididas', () => {
  const s = forecastSettlement({
    // pessoa 1 pagou 100 dividido 50/50 na conta dela -> P2 deve 50
    mesAtualRows: [{ amount_cents: -10000, split_mine_pct: 50, owner: 'me' }],
    // fixa dividida futura de 200, paga pela pessoa 1 -> P2 deve +100
    dividedFloor: [{ amount_cents: -20000, split_mine_pct: 50, owner: 'me' }],
  })
  assert.equal(s.pessoa1, 15000) // 50 + 100 a receber (em centavos)
})

test('owner shared (piso de trombadao futuro): 50/50 nao gera divida, 75/25 gera', () => {
  const meio = forecastSettlement({
    mesAtualRows: [],
    dividedFloor: [{ amount_cents: 100000, split_mine_pct: 50, owner: 'shared' }],
  })
  assert.equal(meio.pessoa1, 0) // pago do conjunto, dividido igual -> sem divida

  const assimetrico = forecastSettlement({
    mesAtualRows: [],
    dividedFloor: [{ amount_cents: 100000, split_mine_pct: 75, owner: 'shared' }],
  })
  assert.equal(assimetrico.pessoa1, -25000) // parte dela seria 75% (75000), conjunto cobre so metade (50000) -> ela deve 25000
})
