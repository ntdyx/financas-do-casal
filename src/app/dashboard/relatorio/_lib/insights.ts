import { effectiveName } from '@/lib/rules'
import { prettyName } from '@/lib/merchants'
import { isRecorrente, catNameOf } from '@/lib/recurring'

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export interface HistTx {
  amount_cents: number
  transaction_date: string // 'YYYY-MM-DD'
  is_fixed?: boolean | null
  fixed_bill_id?: string | null
  description?: string | null
  note?: string | null
  categories?: { name: string } | { name: string }[] | null
}

export const ymOf = (iso: string) => iso.slice(0, 7)

/** Os n meses 'YYYY-MM' imediatamente antes de `mes`, do mais recente ao mais antigo. */
export function monthsBefore(mes: string, n: number): string[] {
  const [y, m] = mes.split('-').map(Number)
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function totalByMonth(txs: HistTx[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of txs) {
    const ym = ymOf(t.transaction_date)
    m.set(ym, (m.get(ym) ?? 0) + Math.abs(t.amount_cents))
  }
  return m
}

export type FaixaStatus = 'acima' | 'abaixo' | 'media' | 'sem-base'
export interface Faixa {
  totalMes: number
  media: number
  variacaoPct: number
  status: FaixaStatus
  baseMeses: number
}

/**
 * Compara o total do `mes` com a média dos `janela` meses anteriores.
 * Meses anteriores dentro do histórico (>= primeiro mês com dados) contam como 0
 * quando não têm gasto; meses antes da conta existir são ignorados. Sem nenhum
 * mês anterior válido → 'sem-base'. Tolerância de ±5% vira 'media' (neutro).
 */
export function computeFaixa(txs: HistTx[], mes: string, janela: number): Faixa {
  const byMonth = totalByMonth(txs)
  const totalMes = byMonth.get(mes) ?? 0
  const active = [...byMonth.keys()].sort()
  const earliest = active[0]
  const prevYms = monthsBefore(mes, janela).filter((ym) => !earliest || ym >= earliest)
  if (prevYms.length === 0) return { totalMes, media: 0, variacaoPct: 0, status: 'sem-base', baseMeses: 0 }
  const prevs = prevYms.map((ym) => byMonth.get(ym) ?? 0)
  const media = Math.round(prevs.reduce((s, v) => s + v, 0) / prevs.length)
  if (media === 0) {
    const status: FaixaStatus = totalMes > 0 ? 'acima' : 'media'
    return { totalMes, media, variacaoPct: 0, status, baseMeses: prevYms.length }
  }
  const variacaoPct = Math.round(((totalMes - media) / media) * 100)
  const status: FaixaStatus = variacaoPct > 5 ? 'acima' : variacaoPct < -5 ? 'abaixo' : 'media'
  return { totalMes, media, variacaoPct, status, baseMeses: prevYms.length }
}

/** Série dos últimos 6 meses (incluindo o atual), cronológica, pra mini-linha. */
export function sparkline(txs: HistTx[], mes: string): { ym: string; label: string; total: number }[] {
  const byMonth = totalByMonth(txs)
  const yms = [...monthsBefore(mes, 6).slice(0, 5).reverse(), mes]
  return yms.map((ym) => {
    const [, mm] = ym.split('-').map(Number)
    return { ym, label: MESES_CURTO[mm - 1], total: byMonth.get(ym) ?? 0 }
  })
}

export function janelaFromParam(med: string | undefined): number {
  return med === '2m' ? 2 : med === '6m' ? 6 : 3
}

export { catNameOf }

export type BadgeKind = 'acima' | 'abaixo' | 'media' | 'novo'
export interface CatBadge {
  kind: BadgeKind
  pct: number
}

function totalByMonthByCat(txs: HistTx[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const t of txs) {
    const ym = ymOf(t.transaction_date)
    const name = catNameOf(t)
    const inner = m.get(ym) ?? new Map<string, number>()
    inner.set(name, (inner.get(name) ?? 0) + Math.abs(t.amount_cents))
    m.set(ym, inner)
  }
  return m
}

/**
 * Pra cada categoria com gasto no `mes`, compara com a média dessa categoria nos
 * meses anteriores da janela — considerando só os meses em que ela apareceu (a
 * "cesta típica"). Sem nenhuma aparição anterior → 'novo'. Tolerância ±5% → 'media'.
 */
export function computeCatBadges(txs: HistTx[], mes: string, janela: number): Map<string, CatBadge> {
  const byMC = totalByMonthByCat(txs)
  const prevYms = monthsBefore(mes, janela)
  const current = byMC.get(mes) ?? new Map<string, number>()
  const out = new Map<string, CatBadge>()
  for (const [name, total] of current) {
    const prevVals = prevYms
      .map((ym) => byMC.get(ym)?.get(name))
      .filter((v): v is number => v !== undefined)
    if (prevVals.length === 0) {
      out.set(name, { kind: 'novo', pct: 0 })
      continue
    }
    const media = prevVals.reduce((s, v) => s + v, 0) / prevVals.length
    const pct = media > 0 ? Math.round(((total - media) / media) * 100) : 0
    const kind: BadgeKind = pct > 5 ? 'acima' : pct < -5 ? 'abaixo' : 'media'
    out.set(name, { kind, pct })
  }
  return out
}

export interface RecurringItem {
  key: string
  name: string
  category: string
  amount: number
  prevAmount: number | null // preço no mês anterior, quando encontrado
}
export interface Recurring {
  items: RecurringItem[]
  total: number
  anual: number
}

const nameOf = (t: HistTx) => prettyName(effectiveName({ description: t.description ?? null, note: t.note }))

/** Chave de casamento entre meses: fixed_bill_id se houver, senão nome normalizado. */
const recKey = (t: HistTx) =>
  t.fixed_bill_id ?? nameOf(t).toLowerCase().trim()

/**
 * Recorrentes do mês: transações com is_fixed OU de categoria de assinatura.
 * Dedup por chave (uma linha por serviço). `prevAmount` = valor da mesma chave no
 * mês anterior, pra o front sinalizar aumento. `anual` = total × 12.
 */
export function computeRecurring(txs: HistTx[], mes: string): Recurring {
  const prevYm = monthsBefore(mes, 1)[0]
  const prevByKey = new Map<string, number>()
  for (const t of txs) {
    if (ymOf(t.transaction_date) !== prevYm || !isRecorrente(t)) continue
    const k = recKey(t)
    prevByKey.set(k, (prevByKey.get(k) ?? 0) + Math.abs(t.amount_cents))
  }
  const curByKey = new Map<string, RecurringItem>()
  for (const t of txs) {
    if (ymOf(t.transaction_date) !== mes || !isRecorrente(t)) continue
    const k = recKey(t)
    const existing = curByKey.get(k)
    const amount = Math.abs(t.amount_cents)
    if (existing) {
      existing.amount += amount
    } else {
      curByKey.set(k, {
        key: k,
        name: nameOf(t),
        category: catNameOf(t),
        amount,
        prevAmount: prevByKey.has(k) ? prevByKey.get(k)! : null,
      })
    }
  }
  const items = [...curByKey.values()].sort((a, b) => b.amount - a.amount)
  const total = items.reduce((s, i) => s + i.amount, 0)
  return { items, total, anual: total * 12 }
}

export const MIUDO_MAX = 2500 // R$ 25,00 em centavos

export function computeMiudos(txs: HistTx[], mes: string): { count: number; total: number } {
  let count = 0
  let total = 0
  for (const t of txs) {
    if (ymOf(t.transaction_date) !== mes) continue
    const v = Math.abs(t.amount_cents)
    if (v < MIUDO_MAX) {
      count++
      total += v
    }
  }
  return { count, total }
}

export interface MerchantStat {
  name: string
  count: number
  total: number // centavos
  avg: number // centavos, arredondado
  prevCount: number // vezes no mês anterior (mesma categoria + lugar)
  delta: number // count - prevCount
}

/**
 * Por categoria do mês, agrupa os gastos por estabelecimento (nameOf) e mantém
 * só os que se repetem (2×+). Cada lugar traz count/total/média e a frequência
 * do mesmo lugar+categoria no mês anterior (prevCount → delta), pra sinalizar
 * hábito ("14× · +4"). Chave por categoria+lugar pra não misturar iFood de
 * categorias diferentes.
 */
export function computeMerchantSummaries(txs: HistTx[], mes: string): Map<string, MerchantStat[]> {
  const prevYm = monthsBefore(mes, 1)[0]
  const prevCounts = new Map<string, number>()
  for (const t of txs) {
    if (ymOf(t.transaction_date) !== prevYm) continue
    const k = `${catNameOf(t)}||${nameOf(t).toLowerCase().trim()}`
    prevCounts.set(k, (prevCounts.get(k) ?? 0) + 1)
  }
  const cur = new Map<string, Map<string, { name: string; count: number; total: number }>>()
  for (const t of txs) {
    if (ymOf(t.transaction_date) !== mes) continue
    const cat = catNameOf(t)
    const name = nameOf(t)
    const lk = name.toLowerCase().trim()
    const inner = cur.get(cat) ?? new Map<string, { name: string; count: number; total: number }>()
    const e = inner.get(lk) ?? { name, count: 0, total: 0 }
    e.count += 1
    e.total += Math.abs(t.amount_cents)
    inner.set(lk, e)
    cur.set(cat, inner)
  }
  const out = new Map<string, MerchantStat[]>()
  for (const [cat, inner] of cur) {
    const stats: MerchantStat[] = []
    for (const [lk, e] of inner) {
      if (e.count < 2) continue
      const prevCount = prevCounts.get(`${cat}||${lk}`) ?? 0
      stats.push({ name: e.name, count: e.count, total: e.total, avg: Math.round(e.total / e.count), prevCount, delta: e.count - prevCount })
    }
    if (stats.length > 0) {
      stats.sort((a, b) => b.total - a.total)
      out.set(cat, stats)
    }
  }
  return out
}

export type InsightKind = 'merchant' | 'category' | 'miudos' | 'subscriptions'

export interface MerchantData { name: string; count: number; delta: number; totalCents: number }
export interface CategoryData { cat: string; pct: number; currentCents: number; mediaCents: number; janela: number }
export interface MiudosData { count: number; totalCents: number }
export interface SubscriptionsData { monthlyCents: number; annualCents: number; increase: { name: string; fromCents: number; toCents: number } | null }

export interface SavingInsight {
  id: string
  kind: InsightKind
  icon: string
  savingCents: number | null
  countsToTotal: boolean
  data: MerchantData | CategoryData | MiudosData | SubscriptionsData
}
export interface SavingsReport {
  insights: SavingInsight[]
  potentialCents: number
  positive: { cat: string; pct: number } | null
}

const TOP_INSIGHTS = 4
const CAT_ABOVE_PCT = 20
const CAT_MIN_EXCESS = 5000 // R$50
const MERCHANT_MIN_SAVING = 3000 // R$30
const MIUDO_MIN_COUNT = 10
const MIUDO_MIN_TOTAL = 15000 // R$150

/**
 * Motor de "onde economizar": lê os sinais já calculados (estabelecimentos,
 * categorias vs média, miúdos, assinaturas) e emite cartões acionáveis ancorados
 * num R$ de economia estimada, rankeados. Sem fetch novo. Números ficam como
 * cents estruturados pra o componente renderizar com <Money> (respeita "Esconder
 * valores").
 */
export function computeSavingsInsights(txs: HistTx[], mes: string, janela: number): SavingsReport {
  const insights: SavingInsight[] = []
  const usedCats = new Set<string>()

  // R1 — estabelecimento em alta (maior custo extra)
  const merchByCat = computeMerchantSummaries(txs, mes)
  let best: { cat: string; m: MerchantStat; saving: number } | null = null
  for (const [cat, list] of merchByCat) {
    for (const m of list) {
      if (m.delta <= 0) continue
      const saving = m.delta * m.avg
      if (saving < MERCHANT_MIN_SAVING) continue
      if (!best || saving > best.saving) best = { cat, m, saving }
    }
  }
  if (best) {
    insights.push({
      id: `merchant-${best.m.name}`,
      kind: 'merchant',
      icon: '🔺',
      savingCents: best.saving,
      countsToTotal: true,
      data: { name: best.m.name, count: best.m.count, delta: best.m.delta, totalCents: best.m.total },
    })
    usedCats.add(best.cat)
  }

  // R2 — categorias acima da própria média (até 2, fora as já cobertas por R1)
  const byMC = totalByMonthByCat(txs)
  const prevYms = monthsBefore(mes, janela)
  const current = byMC.get(mes) ?? new Map<string, number>()
  const cands: { cat: string; pct: number; currentCents: number; mediaCents: number; excess: number }[] = []
  for (const [cat, currentCents] of current) {
    if (usedCats.has(cat)) continue
    const prevVals = prevYms.map((ym) => byMC.get(ym)?.get(cat)).filter((v): v is number => v !== undefined)
    if (prevVals.length === 0) continue
    const mediaCents = Math.round(prevVals.reduce((s, v) => s + v, 0) / prevVals.length)
    if (mediaCents <= 0) continue
    const excess = currentCents - mediaCents
    const pct = Math.round((excess / mediaCents) * 100)
    if (pct < CAT_ABOVE_PCT || excess < CAT_MIN_EXCESS) continue
    cands.push({ cat, pct, currentCents, mediaCents, excess })
  }
  cands.sort((a, b) => b.excess - a.excess)
  for (const c of cands.slice(0, 2)) {
    insights.push({
      id: `category-${c.cat}`,
      kind: 'category',
      icon: '📈',
      savingCents: c.excess,
      countsToTotal: true,
      data: { cat: c.cat, pct: c.pct, currentCents: c.currentCents, mediaCents: c.mediaCents, janela },
    })
  }

  // R3 — miúdos (não entra no total; estimativa mole de corte pela metade)
  const miudos = computeMiudos(txs, mes)
  if (miudos.count >= MIUDO_MIN_COUNT && miudos.total >= MIUDO_MIN_TOTAL) {
    insights.push({
      id: 'miudos',
      kind: 'miudos',
      icon: '🐜',
      savingCents: Math.round(miudos.total / 2),
      countsToTotal: false,
      data: { count: miudos.count, totalCents: miudos.total },
    })
  }

  // R4 — assinaturas (anualizado; economia = aumentos, quando houver)
  const rec = computeRecurring(txs, mes)
  if (rec.total > 0) {
    let increase: { name: string; fromCents: number; toCents: number } | null = null
    let increaseSum = 0
    for (const i of rec.items) {
      if (i.prevAmount !== null && i.amount > i.prevAmount) {
        increaseSum += i.amount - i.prevAmount
        if (!increase || i.amount - i.prevAmount > increase.toCents - increase.fromCents) {
          increase = { name: i.name, fromCents: i.prevAmount, toCents: i.amount }
        }
      }
    }
    insights.push({
      id: 'subscriptions',
      kind: 'subscriptions',
      icon: '🔁',
      savingCents: increaseSum > 0 ? increaseSum : null,
      countsToTotal: increaseSum > 0,
      data: { monthlyCents: rec.total, annualCents: rec.anual, increase },
    })
  }

  // ranking: economia desc, nulos por último; top N
  insights.sort((a, b) => (b.savingCents ?? -1) - (a.savingCents ?? -1))
  const top = insights.slice(0, TOP_INSIGHTS)
  const potentialCents = top.filter((i) => i.countsToTotal).reduce((s, i) => s + (i.savingCents ?? 0), 0)

  // reforço positivo: maior queda vs média
  let positive: { cat: string; pct: number } | null = null
  for (const [cat, currentCents] of current) {
    const prevVals = prevYms.map((ym) => byMC.get(ym)?.get(cat)).filter((v): v is number => v !== undefined)
    if (prevVals.length === 0) continue
    const mediaCents = prevVals.reduce((s, v) => s + v, 0) / prevVals.length
    if (mediaCents <= 0 || currentCents >= mediaCents) continue
    const pct = Math.round(((mediaCents - currentCents) / mediaCents) * 100)
    if (pct < 10) continue
    if (!positive || pct > positive.pct) positive = { cat, pct }
  }

  return { insights: top, potentialCents, positive }
}
