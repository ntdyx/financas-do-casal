import { createClient } from '@/lib/supabase/server'
import { CategoryManager } from './_components/category-manager'
import { SubTabs, CONFIG_TABS } from '../_components/sub-tabs'

export default async function CategoriasPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, emoji, color, user_id')
    .order('name')

  return (
    <div className="mx-auto max-w-2xl">
      <SubTabs tabs={CONFIG_TABS} />
      <div className="mb-6">
        <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>Categorias</h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Crie, edite (nome, emoji, cor) ou apague as categorias dos seus gastos.
        </p>
      </div>
      <CategoryManager categories={categories ?? []} />
    </div>
  )
}
