/**
 * Cron diario do ritmo do mes. Chamado pelo pg_cron do Supabase (via pg_net)
 * uma vez por dia, igual ao de contas fixas. Projeta como o mes vai fechar e,
 * quando a sobra prevista fica NEGATIVA, manda UM e-mail — so na primeira vez
 * (grava em pace_alerts pra nao repetir todo dia).
 *
 * A regua e "cabe no teto?", nao "e o meu habitual": comparar com o proprio
 * habito mente quando o habito ja e caro — diria "no ritmo" enquanto a conta
 * afunda. Sem teto combinado no mes, nao manda nada.
 * Protegido por x-cron-secret.
 */
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOUSEHOLD_OWNER_ID, MEMBERS } from '@/lib/members'
import { fetchAllPages } from '@/lib/paginate'
import { deveAlertar } from '@/lib/pace-alert'
import { catNameOf } from '@/lib/recurring'
import { baldeDe } from '@/lib/gastos'
import { mesesBase, baseline, projetaFatura, sobraPrevista, type HistTx } from '@/app/dashboard/previsao/_lib/forecast'
import { capForMonth, type SpendCapRow } from '@/lib/spend-cap'
import { plannedForMonth, type PlannedBill } from '@/app/dashboard/previsao/_lib/planned'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export async function POST(req: Request) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const userId = HOUSEHOLD_OWNER_ID

  // Data de HOJE no fuso de Sao Paulo — o dia do mes decide se a projecao presta.
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [year, month, day] = hoje.split('-').map(Number)
  const mes = `${year}-${String(month).padStart(2, '0')}`
  const mesStart = `${mes}-01`
  const now = new Date(year, month - 1, day)

  // Ja avisou neste mes? Entao nem calcula.
  const { data: jaAlerta } = await supabase
    .from('pace_alerts').select('id').eq('user_id', userId).eq('year', year).eq('month', month).maybeSingle()
  if (jaAlerta) return NextResponse.json({ ok: true, mes, enviado: false, motivo: 'ja alertou' })

  if (day < 5) return NextResponse.json({ ok: true, mes, enviado: false, motivo: 'antes do dia 5' })

  const base = mesesBase(now)
  const janelaStart = `${base[0]}-01`

  const [histTxs, capRes, plannedRes] = await Promise.all([
    fetchAllPages<HistTx>((from, to) => supabase
      .from('transactions')
      .select('amount_cents, transaction_date, is_fixed, fixed_bill_id, categories(name)')
      .eq('user_id', userId).eq('is_transfer', false).lt('amount_cents', 0)
      .gte('transaction_date', janelaStart).lte('transaction_date', hoje)
      .order('id', { ascending: true }).range(from, to)),
    supabase.from('spend_caps').select('amount_cents, effective_from').eq('user_id', userId).order('effective_from', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('planned_bills').select('*').eq('user_id', userId),
  ])

  const b = baseline(histTxs, base)
  const teto = capForMonth((capRes.data ?? []) as SpendCapRow[], mes)
  const trombadoes = plannedForMonth((plannedRes.data ?? []) as PlannedBill[], mes)
    .reduce((s, h) => s + h.amount_cents, 0)

  const gastosDoMes = histTxs.filter((t) => t.transaction_date >= mesStart)
  const projecao = projetaFatura(gastosDoMes, now, b.rotinaTipica)
  const sobra = teto == null
    ? 0
    : sobraPrevista({ teto, fixas: b.fixoTipico, variavel: projecao.projetadoFechar, trombadoes })

  // jaAlertou/diaDoMes ja foram checados acima (pra nem rodar as queries a toa);
  // passam de novo aqui pra regra viver num lugar so.
  if (!deveAlertar({ sobra, jaAlertou: false, diaDoMes: day, temTeto: teto != null })) {
    return NextResponse.json({
      ok: true, mes, sobra, teto, enviado: false,
      motivo: teto != null ? 'sobra nao negativa' : 'sem teto combinado',
    })
  }

  // Top 3 da ROTINA por categoria — a resposta de "onde cortar" junto do aviso.
  // Recorrente nao entra (nao da pra cortar hoje) e extraordinario tambem nao
  // (ja esta fora do teto; listar o carro como "onde cortar" nao ajuda ninguem).
  const porCat = new Map<string, number>()
  for (const t of gastosDoMes) {
    if (baldeDe(t) !== 'rotina') continue
    const k = catNameOf(t)
    porCat.set(k, (porCat.get(k) ?? 0) + Math.abs(t.amount_cents))
  }
  const top3 = [...porCat.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3)

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: 'RESEND_API_KEY ausente' }, { status: 500 })
  }

  // Grava ANTES de mandar: o unique (user_id, year, month) e a garantia real de
  // "uma vez so". Se o envio falhar depois disto, o alerta do mes se perde —
  // aceito, porque gravar depois arriscaria e-mail duplicado, que e pior.
  const { error: insErr } = await supabase.from('pace_alerts').insert({ user_id: userId, year, month })
  if (insErr) {
    return NextResponse.json({ ok: true, mes, enviado: false, motivo: 'nao consegui marcar o alerta', detalhe: insErr.message })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const to = process.env.ALERT_EMAILS?.split(',').map((s) => s.trim()).filter(Boolean)
    ?? MEMBERS.map((m) => m.email).filter(Boolean)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

  const linhas = top3.map(([nome, total]) => `
    <tr>
      <td style="padding:8px 0;font-size:15px;">${nome}</td>
      <td style="padding:8px 0;font-size:15px;text-align:right;"><b>${BRL(total)}</b></td>
    </tr>`).join('')

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111;">
    <h2 style="font-size:20px;margin:0 0 4px;">${MESES[month - 1]} não vai fechar</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">
      No ritmo de hoje, ${MESES[month - 1]} fecha <b style="color:#dc2626;">${BRL(sobra)}</b> em relação ao teto de ${BRL(teto ?? 0)}.
      A projeção de rotina é ${BRL(projecao.projetadoFechar)}.
    </p>
    <p style="font-size:14px;margin:0 0 6px;"><b>Onde está indo a rotina:</b></p>
    <table style="width:100%;border-collapse:collapse;">${linhas}</table>
    <a href="${appUrl}/dashboard" style="display:inline-block;margin-top:20px;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;">Ver no Gastadeiras →</a>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Você recebe isto uma vez por mês, no dia em que a conta deixa de fechar. 💜</p>
  </div>`

  try {
    await resend.emails.send({
      from: 'Gastadeiras <onboarding@resend.dev>',
      to,
      subject: `⚠️ ${MESES[month - 1]} fecha com ${BRL(sobra)}`,
      html,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'falha ao enviar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mes, sobra, projetado: projecao.projetadoFechar, enviado: true })
}
