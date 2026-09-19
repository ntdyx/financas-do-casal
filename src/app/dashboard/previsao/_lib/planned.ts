export interface PlannedBill {
  id: string
  name: string
  emoji: string
  amount_cents: number
  recurrence: 'yearly' | 'semiannual' | 'once'
  month: number          // 1-12
  year: number | null    // so para 'once'
  installments: number
  split_mine_pct: number | null
  active: boolean
}

export interface PlannedHit {
  bill: PlannedBill
  amount_cents: number
  installmentLabel: string | null
}

export function plannedForMonth(bills: PlannedBill[], ym: string): PlannedHit[] {
  const [y, m] = ym.split('-').map(Number)
  const out: PlannedHit[] = []
  for (const b of bills) {
    if (!b.active) continue
    let hit = false
    if (b.recurrence === 'once') hit = b.year === y && b.month === m
    else if (b.recurrence === 'yearly') hit = b.month === m
    else hit = b.month === m || (((b.month - 1 + 6) % 12) + 1) === m // semiannual
    if (!hit) continue
    const inst = Math.max(1, b.installments)
    out.push({
      bill: b,
      amount_cents: Math.round(b.amount_cents / inst),
      installmentLabel: inst > 1 ? `1/${inst}` : null,
    })
  }
  return out
}
