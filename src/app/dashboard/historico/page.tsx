import { P1, P2 } from '@/lib/casal'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { memberByName } from '@/lib/members'
import { UndoActivityButton } from './_components/undo-activity-button'
import { SubTabs, APRENDIZADOS_TABS } from '../_components/sub-tabs'

const ACTION_EMOJI: Record<string, string> = {
  'Categoria': '🏷️',
  'Divisão': '➗',
  'Revisão': '✓',
  'Revisado': '✓',
  'Desfez revisão': '↩',
  'Marcou fixo': '📌',
  'Desmarcou fixo': '📌',
  'Observação': '📝',
  'Marcou não-gasto': '⇄',
  'Desmarcou não-gasto': '⇄',
  'Lançamento manual': '➕',
  'Removeu lançamento': '🗑️',
  'Fechou o mês': '🔒',
  'Reabriu o mês': '↩',
}

function actionEmoji(action: string): string {
  if (action.startsWith('IA aplicou')) return '🤖'
  return ACTION_EMOJI[action] ?? '•'
}

export default async function HistoricoPage() {
  const user = await getUser()
  const supabase = await createClient()

  // select '*' (e não a lista explícita) pra não quebrar caso a coluna `actor`
  // ainda não exista no banco — aí l.actor vem undefined e cai no emoji.
  const { data: logs } = await supabase
    .from('activity_log')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(150)

  const list = logs ?? []

  return (
    <div className="mx-auto max-w-2xl">
      <SubTabs tabs={APRENDIZADOS_TABS} />
      <div className="mb-6">
        <h1 className="gd-display text-3xl" style={{ color: 'var(--ink)' }}>Histórico</h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Tudo que {P1.name} e {P2.name} fizeram, em ordem. Dá pra desfazer cada mudança.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="gd-empty">
          <p>Nenhuma ação registrada ainda.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((l) => {
            const when = new Date(l.created_at).toLocaleString('pt-BR', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })
            const canUndo = !l.undone && !!l.field
            const who = memberByName(l.actor)
            return (
              <div
                key={l.id}
                className="gd-row flex items-center justify-between gap-3 px-4 py-2.5"
                style={{ opacity: l.undone ? 0.5 : 1 }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {who?.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={who.photo} alt={who.name} title={who.name} className="h-7 w-7 shrink-0 rounded-full object-cover"
                      style={{ border: `1.5px solid ${who.name === P2.name ? 'var(--je)' : 'var(--na)'}` }} />
                  ) : (
                    <span className="shrink-0">{actionEmoji(l.action)}</span>
                  )}
                  <div className="min-w-0">
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>
                      {who && <span className="font-semibold" style={{ color: who.name === P2.name ? 'var(--je)' : 'var(--na)' }}>{who.name} </span>}
                      <span className="font-medium">{actionEmoji(l.action)} {l.action}</span>
                      {l.tx_description && <span style={{ color: 'var(--ink-soft)' }}> · {l.tx_description}</span>}
                    </span>
                    <div className="text-[11px]" style={{ color: 'var(--ink-softer)' }}>{when}{l.undone ? ' · desfeito' : ''}</div>
                  </div>
                </div>
                {canUndo && <UndoActivityButton logId={l.id} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
