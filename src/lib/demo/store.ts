export type Row = Record<string, unknown>
export type DemoStore = Record<string, Row[]>

export const TABLES = [
  'categories', 'accounts', 'transactions', 'fixed_bills',
  'fixed_bill_marks', 'fixed_bill_alerts', 'monthly_closings', 'activity_log',
  'category_rules', 'split_rules', 'fixed_rules', 'transfer_rules', 'planned_bills',
  'spend_caps', 'pace_alerts',
] as const

// Substituído na Task 8 pelos fixtures reais. Por ora, tabelas vazias.
export function seedFixtures(): DemoStore {
  const s: DemoStore = {}
  for (const t of TABLES) s[t] = []
  return s
}

let store: DemoStore | null = null

export function getStore(): DemoStore {
  if (!store) store = seedFixtures()
  return store
}

export function resetStore(): void {
  store = seedFixtures()
}
