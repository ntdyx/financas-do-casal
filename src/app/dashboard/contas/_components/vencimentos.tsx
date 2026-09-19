import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { computeExpectedDays } from '@/lib/fixed'
import { PG_MAX_ROWS } from '@/lib/paginate'
import { hojeSaoPaulo } from '@/lib/contas-a-pagar'
import { VencimentoRow } from './vencimento-row'

/**
 * "Quando vence cada conta" — a tela onde o casal cadastra o dia do vencimento.
 *
 * É a peça que faltava: sem esse dia, o app só sabia a mediana do dia em que a
 * conta FOI PAGA, ou seja aprendia o atraso, e conta nova (sem histórico) nunca
 * gerava aviso. Com o dia cadastrado, o card da home e o e-mail passam a cobrar
 * antes do vencimento em vez de constatar o atraso depois.
 */
export async function Vencimentos() {
  const user = await getUser()
  if (!user) return null
  const supabase = await createClient()

  const inicioDoMes = `${hojeSaoPaulo().slice(0, 7)}-01`

  const [{ data: bills }, { data: historico }] = await Promise.all([
    supabase.from('fixed_bills').select('id, name, emoji, position, due_day')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('name', { ascending: true }),
    // Histórico só pra SUGERIR um dia. ~80 linhas hoje; PG_MAX_ROWS explicita que
    // 1000 é o teto real do PostgREST.
    supabase.from('transactions').select('fixed_bill_id, transaction_date')
      .eq('user_id', user.id).not('fixed_bill_id', 'is', null)
      .lt('transaction_date', inicioDoMes)
      .order('transaction_date', { ascending: false })
      .limit(PG_MAX_ROWS),
  ])

  const rows = bills ?? []
  if (rows.length === 0) return null

  const aprendido = computeExpectedDays(historico ?? [])
  const semDia = rows.filter((b) => b.due_day == null).length

  return (
    <div className="mt-10">
      <h2 className="mb-1.5 text-base font-semibold" style={{ color: 'var(--ink-2)' }}>
        Quando vence cada conta
      </h2>
      <p className="mb-4 max-w-xl text-[13px]" style={{ color: 'var(--ink-soft)' }}>
        O app só consegue avisar antes do vencimento se souber o dia. Sem o dia, ele
        só percebe depois que a conta caiu — ou não avisa nada.
        {semDia > 0 && (
          <>
            {' '}
            <b style={{ color: 'var(--negative)' }}>
              {semDia === 1 ? 'Falta 1 conta.' : `Faltam ${semDia} contas.`}
            </b>
          </>
        )}
      </p>

      <div className="rounded-2xl border px-5 pb-2 pt-1" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        {rows.map((b) => (
          <VencimentoRow
            key={b.id}
            id={b.id}
            name={b.name}
            emoji={b.emoji}
            dueDay={b.due_day ?? null}
            diaAprendido={aprendido.get(b.id) ?? null}
          />
        ))}
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: 'var(--ink-softer)' }}>
        “usar dia N” é só palpite: N é o dia em que vocês costumam PAGAR, que pode
        ser justamente o dia atrasado. Confira no boleto.
      </p>
    </div>
  )
}
