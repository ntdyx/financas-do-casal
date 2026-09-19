import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { similarKey } from '@/lib/rules'
import { type Learning } from './_components/learning-row'
import { LearningList } from './_components/learning-list'
import { SubTabs, APRENDIZADOS_TABS } from '../_components/sub-tabs'
import { fetchAllPages } from '@/lib/paginate'

interface Rule extends Learning {
  ts: number
}

export default async function AprendizadosPage() {
  const user = await getUser()
  const supabase = await createClient()

  const [{ data: catRules }, { data: splitRules }, { data: fixedRules }, { data: transferRules }, { data: categories }, txs] = await Promise.all([
    supabase.from('category_rules').select('description_pattern, category_id, updated_at, categories(name, emoji, color)').eq('user_id', user!.id),
    supabase.from('split_rules').select('description_pattern, updated_at, split_mine_pct').eq('user_id', user!.id),
    supabase.from('fixed_rules').select('description_pattern, created_at').eq('user_id', user!.id),
    supabase.from('transfer_rules').select('description_pattern, created_at').eq('user_id', user!.id),
    supabase.from('categories').select('id, name, emoji, color').order('name'),
    // Pagina: o PostgREST corta em 1000 e são ~1.9k gastos — com `.limit(5000)`
    // a distribuição por loja era calculada em cima de metade do histórico.
    fetchAllPages<{ description: string | null; split_mine_pct: number | null }>((from, to) =>
      supabase.from('transactions').select('description, split_mine_pct')
        .eq('user_id', user!.id).eq('is_transfer', false).lt('amount_cents', 0)
        .order('id', { ascending: true }).range(from, to)),
  ])
  const cats = categories ?? []

  // Como a divisão varia por gasto (depende de quem pagou), montamos a
  // distribuição real por LOJA pra MOSTRAR em cada aprendizado — ex.:
  // "3× 50/50 · 1× 100% P1". Agrupa por similarKey (junta parcelas e variações
  // da marca: ifood=ifd, Maislaser 1/5 = 2/5…) pra dar a visão do comerciante.
  const splitByMerchant = new Map<string, Map<number | null, number>>()
  for (const t of txs) {
    const key = similarKey(t.description ?? '')
    if (!key) continue
    let m = splitByMerchant.get(key)
    if (!m) { m = new Map(); splitByMerchant.set(key, m) }
    m.set(t.split_mine_pct, (m.get(t.split_mine_pct) ?? 0) + 1)
  }

  // Merge por descrição, guardando a data mais recente (ordem de aprovação)
  const map = new Map<string, Rule>()
  const ensure = (p: string, ts?: string | null) => {
    let r = map.get(p)
    if (!r) { r = { pattern: p, cat: null, categoryId: null, fixed: false, transfer: false, splitBreakdown: [], ts: 0 }; map.set(p, r) }
    if (ts) r.ts = Math.max(r.ts, new Date(ts).getTime())
    return r
  }
  for (const r of catRules ?? []) {
    const c = Array.isArray(r.categories) ? r.categories[0] : r.categories
    const rule = ensure(r.description_pattern, r.updated_at)
    rule.cat = c ?? null
    rule.categoryId = r.category_id
  }
  for (const r of splitRules ?? []) {
    ensure(r.description_pattern, r.updated_at).splitRule = r.split_mine_pct
  }
  for (const r of fixedRules ?? []) {
    ensure(r.description_pattern, r.created_at).fixed = true
  }
  for (const r of transferRules ?? []) {
    ensure(r.description_pattern, r.created_at).transfer = true
  }

  // distribuição da divisão por loja (mais comum primeiro)
  for (const r of map.values()) {
    const m = splitByMerchant.get(similarKey(r.pattern))
    r.splitBreakdown = m
      ? [...m.entries()].map(([split, count]) => ({ split, count })).sort((a, b) => b.count - a.count)
      : []
  }

  // Mais recentes primeiro (ordem de aprovação)
  const rules = Array.from(map.values()).sort((a, b) => b.ts - a.ts)

  return (
    <div className="mx-auto max-w-3xl">
      <SubTabs tabs={APRENDIZADOS_TABS} />
      <div className="mb-6">
        <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>
          Aprendizados
        </h1>
        <p
          className="mt-1.5 text-sm"
          style={{ color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 620 }}
        >
          O que o app aprendeu: cada empresa com sua categoria. Toda vez que ela aparecer, aplica sozinho.
          Toque em <b>Editar</b> pra mudar a categoria ou o 📌 fixo, ou em Esquecer pra apagar. A divisão (de quem cobrou) é por gasto, na tela de Gastos.
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="gd-empty">
          <p>Nada aprendido ainda. Comece categorizando seus gastos. 🧠</p>
        </div>
      ) : (
        <LearningList rules={rules} categories={cats} />
      )}

      <div
        className="flex items-start"
        style={{
          background: 'var(--accent-soft)',
          borderRadius: 14,
          padding: '16px 18px',
          marginTop: 18,
          maxWidth: 680,
          gap: 12,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>💡</span>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>
          Quando você recategoriza ou redivide um gasto, o app memoriza a empresa (descrição → categoria + divisão) e reaplica no próximo sync. Quanto mais você revisa, menos trabalho na próxima vez.
        </p>
      </div>
    </div>
  )
}
