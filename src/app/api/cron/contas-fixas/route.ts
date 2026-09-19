/**
 * Cron diário das contas a pagar. Chamado pelo pg_cron do Supabase (via pg_net)
 * uma vez por dia. Protegido por x-cron-secret.
 *
 * O QUE MUDOU: antes ele só constatava atraso, e ainda por cima contra a MEDIANA
 * do dia em que a conta costumava ser paga — ou seja, aprendia o atraso do casal
 * e avisava depois da multa; conta sem histórico não gerava aviso nenhum. Agora:
 *   * usa o dia do vencimento cadastrado (fixed_bills.due_day);
 *   * manda o aviso NO DIA (kind 'hoje') e, se ninguém pagar, a bronca depois
 *     (kind 'atrasada') — com uma chave só, o primeiro e-mail calava o segundo;
 *   * inclui a fatura do cartão, que é a maior conta do mês e tem vencimento de
 *     verdade vindo da Pluggy;
 *   * respeita as contas resolvidas na mão (fixed_bill_marks) — o cron antigo
 *     ignorava e cobrava conta que o casal já tinha resolvido no Fechamento.
 */
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOUSEHOLD_OWNER_ID, MEMBERS } from '@/lib/members'
import { carregaContasAPagar, hojeSaoPaulo } from '@/lib/contas-a-pagar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIA = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}` : '')

interface Empurrao {
  ref: string
  kind: 'hoje' | 'atrasada'
  emoji: string
  label: string
  valor: number
  vencimento: string | null
  aproximado: boolean
}

export async function POST(req: Request) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const userId = HOUSEHOLD_OWNER_ID
  const hoje = hojeSaoPaulo()
  const [year, month] = hoje.split('-').map(Number)

  const snap = await carregaContasAPagar(supabase, userId, { hoje })

  const empurroes: Empurrao[] = [
    ...snap.agora.contas.map((c): Empurrao => ({
      ref: `bill:${c.id}`,
      kind: c.status === 'atrasada' ? 'atrasada' : 'hoje',
      emoji: c.emoji, label: c.label, valor: c.typical,
      vencimento: c.vencimento, aproximado: !!c.palpite,
    })),
    ...snap.agora.faturas.map((f): Empurrao => ({
      ref: `fatura:${f.id}`,
      kind: 'hoje',
      emoji: '💳', label: `Fatura ${f.name}`, valor: f.amount,
      vencimento: f.dueDate, aproximado: false,
    })),
  ]

  if (empurroes.length === 0) {
    return NextResponse.json({ ok: true, mes: snap.mes, enviado: false, motivo: 'nada vencendo hoje', semDia: snap.semDia })
  }

  // Quem já foi avisado neste mês (por tipo de aviso). Se não deu pra LER, pare:
  // seguir com a lista vazia faria o cron reenviar tudo todo dia, e o "avisa uma
  // vez só" depende inteiramente desta leitura.
  const jaRes = await supabase
    .from('bill_nudges').select('ref, kind')
    .eq('user_id', userId).eq('year', year).eq('month', month)
  if (jaRes.error) {
    return NextResponse.json(
      { ok: false, error: 'nao consegui ler bill_nudges', detalhe: jaRes.error.message },
      { status: 500 },
    )
  }
  const ja = new Set((jaRes.data ?? []).map((r) => `${r.ref}|${r.kind}`))
  const novos = empurroes.filter((e) => !ja.has(`${e.ref}|${e.kind}`))

  if (novos.length === 0) {
    return NextResponse.json({ ok: true, mes: snap.mes, enviado: false, motivo: 'ja avisou', pendentes: empurroes.length })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: 'RESEND_API_KEY ausente', novos: novos.length }, { status: 500 })
  }

  // Marca ANTES de mandar: o unique (user_id, ref, kind, year, month) é a única
  // garantia real de "uma vez só". Se o envio falhar, apaga o que acabou de
  // marcar — aí amanhã o cron tenta de novo em vez de perder o aviso calado.
  const marcas = novos.map((e) => ({ user_id: userId, ref: e.ref, kind: e.kind, year, month }))
  const { error: insErr } = await supabase.from('bill_nudges').insert(marcas)
  if (insErr) {
    return NextResponse.json({ ok: false, error: 'nao consegui marcar o aviso', detalhe: insErr.message }, { status: 500 })
  }

  const desmarcar = async () => {
    for (const m of marcas) {
      await supabase.from('bill_nudges').delete()
        .eq('user_id', userId).eq('ref', m.ref).eq('kind', m.kind).eq('year', year).eq('month', month)
    }
  }

  const atrasadas = novos.filter((e) => e.kind === 'atrasada')
  const total = novos.reduce((s, e) => s + e.valor, 0)
  const subject = atrasadas.length > 0
    ? (novos.length === 1
        ? `🔴 ${novos[0].label} venceu e não foi paga`
        : `🔴 ${atrasadas.length} conta${atrasadas.length > 1 ? 's' : ''} venceu sem pagar`)
    : (novos.length === 1
        ? `⏰ Vence hoje: ${novos[0].label}${novos[0].valor ? ` · ${BRL(novos[0].valor)}` : ''}`
        : `⏰ ${novos.length} contas vencem hoje · ${BRL(total)}`)

  const linha = (e: Empurrao) => `
    <tr>
      <td style="padding:9px 0;font-size:15px;">${e.emoji} <b>${e.label}</b>${e.valor ? ` <span style="color:#6b7280;">${e.aproximado ? '~' : ''}${BRL(e.valor)}</span>` : ''}</td>
      <td style="padding:9px 0;font-size:13px;text-align:right;color:${e.kind === 'atrasada' ? '#dc2626' : '#111'};font-weight:600;">
        ${e.kind === 'atrasada' ? `venceu ${DIA(e.vencimento)}` : 'vence hoje'}
      </td>
    </tr>`

  const semana = [
    ...snap.semana.contas.map((c) => ({ emoji: c.emoji, label: c.label, valor: c.typical, vencimento: c.vencimento })),
    ...snap.semana.faturas.map((f) => ({ emoji: '💳', label: `Fatura ${f.name}`, valor: f.amount, vencimento: f.dueDate })),
  ]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111;">
    <h2 style="font-size:20px;margin:0 0 4px;">${atrasadas.length > 0 ? 'Conta vencida sem pagamento' : 'Pra pagar hoje'}</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 14px;">Contas de ${MESES[month - 1]}${total ? ` · ${BRL(total)}` : ''}</p>
    <table style="width:100%;border-collapse:collapse;">${novos.map(linha).join('')}</table>
    ${semana.length > 0 ? `
      <p style="font-size:13px;color:#6b7280;margin:20px 0 4px;font-weight:600;">Ainda essa semana:</p>
      <table style="width:100%;border-collapse:collapse;">${semana.map((s) => `
        <tr>
          <td style="padding:5px 0;font-size:13.5px;color:#374151;">${s.emoji} ${s.label}</td>
          <td style="padding:5px 0;font-size:12.5px;text-align:right;color:#6b7280;">${DIA(s.vencimento)}${s.valor ? ` · ${BRL(s.valor)}` : ''}</td>
        </tr>`).join('')}</table>` : ''}
    <a href="${appUrl}/dashboard" style="display:inline-block;margin-top:20px;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;">Ver no Gastadeiras →</a>
    ${snap.semDia > 0 ? `<p style="color:#9ca3af;font-size:12px;margin-top:18px;">${snap.semDia} conta${snap.semDia > 1 ? 's' : ''} ainda sem dia de vencimento cadastrado — sem o dia, o aviso é um chute. <a href="${appUrl}/dashboard/contas" style="color:#7c5cfc;">cadastrar</a></p>` : ''}
    <p style="color:#9ca3af;font-size:12px;margin-top:14px;">Este aviso chega uma vez no dia do vencimento e, se a conta não for paga, uma vez mais depois. 💜</p>
  </div>`

  // Destinatários: ALERT_EMAILS (separado por vírgula) tem prioridade. Sem domínio
  // verificado no Resend, só chega no e-mail dono da conta.
  const to = process.env.ALERT_EMAILS?.split(',').map((s) => s.trim()).filter(Boolean)
    ?? MEMBERS.map((m) => m.email).filter(Boolean)

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: 'Gastadeiras <onboarding@resend.dev>', to, subject, html })
  } catch (e) {
    await desmarcar()
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'falha ao enviar', novos: novos.length },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true, mes: snap.mes, enviado: true,
    novos: novos.map((e) => `${e.label} (${e.kind})`),
    semana: semana.length, semDia: snap.semDia,
  })
}
