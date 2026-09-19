// src/lib/demo/fake-supabase.ts
import { getStore, type Row } from './store.ts'

type Pred = (r: Row) => boolean

// FK conhecidas p/ embeds: nome-da-relação → (coluna FK na linha, tabela alvo)
const EMBEDS: Record<string, { fk: string; table: string }> = {
  categories: { fk: 'category_id', table: 'categories' },
  accounts: { fk: 'account_id', table: 'accounts' },
}

function likeToRegExp(pat: string): RegExp {
  const esc = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${esc}$`, 'i')
}

// extrai nomes de relações embutidas do select: "a, categories(id,name), b" → ['categories']
function parseEmbeds(select: string): string[] {
  const out: string[] = []
  const re = /([a-z_]+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(select))) if (EMBEDS[m[1]]) out.push(m[1])
  return out
}

export class FakeBuilder {
  private preds: Pred[] = []
  private selectStr = '*'
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private rangeFromTo: [number, number] | null = null
  private mode: 'many' | 'single' | 'maybeSingle' = 'many'
  private countMode = false
  private headMode = false
  private selectHit = false
  // preenchido na Task 3:
  protected write: { kind: 'insert' | 'update' | 'upsert' | 'delete'; payload?: unknown; onConflict?: string } | null = null
  protected table: string

  constructor(table: string) { this.table = table }

  select(str = '*', opts?: { count?: string; head?: boolean }) {
    this.selectStr = str
    this.countMode = opts?.count != null
    this.headMode = opts?.head === true
    this.selectHit = true
    return this
  }
  eq(c: string, v: unknown) { this.preds.push(r => r[c] === v); return this }
  neq(c: string, v: unknown) { this.preds.push(r => r[c] !== v); return this }
  gt(c: string, v: any) { this.preds.push(r => (r[c] as any) > v); return this }
  gte(c: string, v: any) { this.preds.push(r => (r[c] as any) >= v); return this }
  lt(c: string, v: any) { this.preds.push(r => (r[c] as any) < v); return this }
  lte(c: string, v: any) { this.preds.push(r => (r[c] as any) <= v); return this }
  in(c: string, arr: unknown[]) { this.preds.push(r => arr.includes(r[c])); return this }
  is(c: string, v: unknown) { this.preds.push(r => (v === null ? r[c] == null : r[c] === v)); return this }
  not(c: string, op: string, v: unknown) {
    if (op === 'is' && v === null) this.preds.push(r => r[c] != null)
    else if (op === 'eq') this.preds.push(r => r[c] !== v)
    else if (op === 'in' && Array.isArray(v)) this.preds.push(r => !v.includes(r[c]))
    else this.preds.push(() => true)
    return this
  }
  or(expr: string) {
    // "col.op.val,col.op.val" → OR de igualdades/is-null
    const parts = expr.split(',').map(s => s.trim()).filter(Boolean)
    const ors: Pred[] = parts.map(p => {
      const [col, op, ...rest] = p.split('.')
      const raw = rest.join('.')
      const val = raw === 'null' ? null : raw
      if (op === 'is') return (r: Row) => r[col] == val
      if (op === 'neq') return (r: Row) => String(r[col]) !== raw
      return (r: Row) => String(r[col]) === raw // eq (default)
    })
    this.preds.push(r => ors.some(f => f(r)))
    return this
  }
  ilike(c: string, pat: string) { const re = likeToRegExp(pat); this.preds.push(r => re.test(String(r[c] ?? ''))); return this }
  contains(c: string, v: unknown) {
    this.preds.push(r => {
      const cell = r[c]
      if (Array.isArray(cell) && Array.isArray(v)) return v.every(x => cell.includes(x))
      return false
    })
    return this
  }
  order(c: string, opts?: { ascending?: boolean }) { this.orderCol = c; this.orderAsc = opts?.ascending ?? true; return this }
  limit(n: number) { this.limitN = n; return this }
  range(a: number, b: number) { this.rangeFromTo = [a, b]; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybeSingle'; return this }

  insert(payload: Row | Row[]) { this.write = { kind: 'insert', payload }; return this }
  update(payload: Row) { this.write = { kind: 'update', payload }; return this }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) { this.write = { kind: 'upsert', payload, onConflict: opts?.onConflict }; return this }
  delete() { this.write = { kind: 'delete' }; return this }

  private stamp(row: Row): Row {
    return { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }
  }

  protected rows(): Row[] { return getStore()[this.table] ?? [] }

  protected applyEmbeds(rows: Row[]): Row[] {
    const embeds = parseEmbeds(this.selectStr)
    if (!embeds.length) return rows
    const store = getStore()
    return rows.map(r => {
      const out: Row = { ...r }
      for (const name of embeds) {
        const { fk, table } = EMBEDS[name]
        const key = r[fk]
        out[name] = key == null ? null : store[table].find(x => x.id === key) ?? null
      }
      return out
    })
  }

  protected read(): { data: unknown; error: null; count?: number } {
    let rows = this.rows().filter(r => this.preds.every(p => p(r)))
    const total = rows.length
    if (this.orderCol) {
      const c = this.orderCol, asc = this.orderAsc
      rows = [...rows].sort((x, y) => {
        const a = x[c] as any, b = y[c] as any
        if (a === b) return 0
        if (a == null) return 1
        if (b == null) return -1
        return (a < b ? -1 : 1) * (asc ? 1 : -1)
      })
    }
    if (this.rangeFromTo) rows = rows.slice(this.rangeFromTo[0], this.rangeFromTo[1] + 1)
    if (this.limitN != null) rows = rows.slice(0, this.limitN)
    rows = this.applyEmbeds(rows)
    if (this.mode === 'single') {
      return rows.length ? { data: rows[0], error: null } : { data: null, error: null }
    }
    if (this.mode === 'maybeSingle') return { data: rows[0] ?? null, error: null }
    const result: { data: unknown; error: null; count?: number } = { data: this.headMode ? null : rows, error: null }
    if (this.countMode) result.count = total
    return result
  }

  // resolução terminal: sem write, comportamento de leitura (Task 2); com write, aplica e devolve
  protected resolve(): { data: unknown; error: null; count?: number } {
    if (!this.write) return this.read()
    const store = getStore()
    const table = (store[this.table] ??= [])
    const affected: Row[] = []

    if (this.write.kind === 'insert') {
      const rows = (Array.isArray(this.write.payload) ? this.write.payload : [this.write.payload]) as Row[]
      for (const r of rows) { const nr = this.stamp(r); table.push(nr); affected.push(nr) }
    } else if (this.write.kind === 'update') {
      for (const r of table) if (this.preds.every(p => p(r))) { Object.assign(r, this.write!.payload as Row, { updated_at: new Date().toISOString() }); affected.push(r) }
    } else if (this.write.kind === 'delete') {
      for (let i = table.length - 1; i >= 0; i--) if (this.preds.every(p => p(table[i]))) affected.push(...table.splice(i, 1))
    } else if (this.write.kind === 'upsert') {
      const keys = (this.write.onConflict ?? 'id').split(',').map(s => s.trim())
      const rows = (Array.isArray(this.write.payload) ? this.write.payload : [this.write.payload]) as Row[]
      for (const r of rows) {
        const existing = table.find(x => keys.every(k => x[k] === r[k]))
        if (existing) { Object.assign(existing, r, { updated_at: new Date().toISOString() }); affected.push(existing) }
        else { const nr = this.stamp(r); table.push(nr); affected.push(nr) }
      }
    }
    // .select() após write → devolve linhas afetadas (com embeds); senão data:null
    if (this.selectHit) {
      const withEmbeds = this.applyEmbeds(affected)
      if (this.mode === 'single' || this.mode === 'maybeSingle') return { data: withEmbeds[0] ?? null, error: null }
      return { data: withEmbeds, error: null }
    }
    return { data: null, error: null }
  }

  then(onF: (v: { data: unknown; error: null; count?: number }) => unknown, onR?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.resolve()).then(onF, onR) }
    catch (e) { return Promise.reject(e).then(onF, onR) }
  }
}

export function createFakeClient() {
  return { from: (table: string) => new FakeBuilder(table) }
}
