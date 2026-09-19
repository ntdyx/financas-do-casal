import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Money } from '@/components/money'
import { carregaContasAPagar } from '@/lib/contas-a-pagar'
import { diasEntre } from '@/lib/due'

/**
 * Card "Contas a pagar" da home. Responde, sem clicar em nada: o que tem que ser
 * pago AGORA, o que vence essa semana, e o que já venceu e não foi pago.
 *
 * Busca os próprios dados (igual FutureInvoices) pra caber na home com duas
 * linhas de mudança, e usa o MESMO carregador do cron do e-mail — tela e aviso
 * nunca discordam no mesmo dia.
 */
export async function ContasAPagar({ mes }: { mes?: string }) {
  const user = await getUser()
  if (!user) return null
  const supabase = await createClient()
  const snap = await carregaContasAPagar(supabase, user.id, { mes })

  // Mês passado/fechado não cobra nada — ali o assunto é o Fechamento.
  if (snap.mes !== snap.hoje.slice(0, 7)) return null

  const agora = [
    ...snap.agora.contas.map((c) => ({
      key: c.id, emoji: c.emoji, label: c.label,
      valor: c.typical, vencimento: c.vencimento,
      atrasada: c.status === 'atrasada',
    })),
    ...snap.agora.faturas.map((f) => ({
      key: f.id, emoji: '💳', label: `Fatura ${f.name}`,
      valor: f.amount, vencimento: f.dueDate, atrasada: false,
    })),
  ]
  const semana = [
    ...snap.semana.contas.map((c) => ({
      key: c.id, emoji: c.emoji, label: c.label, valor: c.typical, vencimento: c.vencimento,
    })),
    ...snap.semana.faturas.map((f) => ({
      key: f.id, emoji: '💳', label: `Fatura ${f.name}`, valor: f.amount, vencimento: f.dueDate,
    })),
  ]

  const totalAgora = agora.reduce((s, i) => s + i.valor, 0)
  // Conta fixa entra pelo valor TÍPICO (o boleto do mês ainda não caiu), então o
  // total é aproximado. O "~" evita prometer um número exato que não é.
  const totalAproximado = snap.agora.contas.some((c) => c.typical > 0)
  const nada = agora.length === 0 && semana.length === 0

  // Nada a cobrar e nenhuma conta sem dia: o card não precisa existir hoje.
  if (nada && snap.semDia === 0) return null

  return (
    <section
      className="rounded-[18px] p-5"
      style={{
        background: agora.length > 0 ? 'var(--negative-soft)' : 'var(--surface)',
        border: `1px solid ${agora.length > 0 ? 'transparent' : 'var(--line)'}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[15px] font-bold" style={{ color: 'var(--ink)' }}>
          <span>{agora.length > 0 ? '⏰' : '🗓️'}</span> Contas a pagar
        </span>
        {agora.length > 0 && (
          <span className="gd-mono text-[13px] font-bold" style={{ color: 'var(--negative)' }}>
            {totalAproximado && '~'}<Money cents={totalAgora} />
          </span>
        )}
      </div>

      {agora.length > 0 && (
        <>
          <p className="mt-3 text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--negative)' }}>
            pagar hoje
          </p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {agora.map((i) => (
              <div key={i.key} className="flex items-center justify-between gap-2 text-[13.5px]">
                <span className="flex min-w-0 items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                  <span className="shrink-0">{i.emoji}</span>
                  <span className="truncate font-semibold">{i.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {i.valor > 0 && (
                    <span className="gd-mono font-semibold" style={{ color: 'var(--ink)' }}>
                      <Money cents={i.valor} />
                    </span>
                  )}
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: 'var(--negative)', color: '#fff' }}
                  >
                    {i.atrasada ? venceuHa(i.vencimento, snap.hoje) : 'vence hoje'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {semana.length > 0 && (
        <>
          <p
            className="mt-4 text-[13px] font-bold uppercase tracking-wide"
            style={{ color: 'var(--ink-soft)' }}
          >
            essa semana
          </p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {semana.map((i) => (
              <div key={i.key} className="flex items-center justify-between gap-2 text-[13.5px]">
                <span className="flex min-w-0 items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                  <span className="shrink-0">{i.emoji}</span>
                  <span className="truncate">{i.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {i.valor > 0 && (
                    <span className="gd-mono" style={{ color: 'var(--ink-2)' }}>
                      <Money cents={i.valor} />
                    </span>
                  )}
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
                  >
                    {emQuantoTempo(i.vencimento, snap.hoje)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {nada && (
        <p className="mt-3 text-[13px] font-medium" style={{ color: 'var(--positive)' }}>
          ✓ nada vencendo nos próximos 7 dias
        </p>
      )}

      {snap.semDia > 0 && (
        <Link
          href="/dashboard/contas"
          className="mt-4 flex items-center justify-between gap-2 rounded-[12px] px-3 py-2.5 text-[12.5px] font-semibold transition-[filter] hover:brightness-[0.98]"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
        >
          <span>
            {snap.semDia === 1
              ? '1 conta sem dia de vencimento — o app não sabe quando cobrar'
              : `${snap.semDia} contas sem dia de vencimento — o app não sabe quando cobrar`}
          </span>
          <span className="shrink-0" style={{ color: 'var(--accent)' }}>definir →</span>
        </Link>
      )}
    </section>
  )
}

/** "venceu ontem" / "venceu há 4 dias" — o atraso em linguagem de gente. */
function venceuHa(vencimento: string | null, hoje: string): string {
  if (!vencimento) return 'atrasada'
  const dias = -diasEntre(hoje, vencimento)
  if (dias <= 0) return 'atrasada'
  if (dias === 1) return 'venceu ontem'
  return `venceu há ${dias} dias`
}

/** "amanhã" / "em 3 dias". */
function emQuantoTempo(vencimento: string | null, hoje: string): string {
  if (!vencimento) return 'a vencer'
  const dias = diasEntre(hoje, vencimento)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  return `em ${dias} dias`
}
