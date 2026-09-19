// src/app/dashboard/previsao/_lib/forecast-settlement.ts
// `settlement.ts` é puro (sem imports) → resolve no node --test via caminho relativo com .ts.
import { computeSettlement, type SettlementRow, type Settlement } from '../../../../lib/settlement.ts'

export function forecastSettlement(input: { mesAtualRows: SettlementRow[]; dividedFloor: SettlementRow[] }): Settlement {
  return computeSettlement([...input.mesAtualRows, ...input.dividedFloor])
}
