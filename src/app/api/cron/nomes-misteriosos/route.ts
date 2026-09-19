/**
 * Cron semanal dos "nomes misteriosos". Chamado pelo pg_cron do Supabase (via
 * pg_net) toda segunda de manha. Junta os gastos dos ultimos 30 dias cujo nome
 * nao diz de onde vieram (Pix pra pessoa, intermediador, categoria generica — ver
 * src/lib/nome-misterioso) e manda UM e-mail (so pra pessoa 1) pedindo uma observacao em cada.
 *
 * Quem nao foi explicado volta na semana seguinte, ate fazer 30 dias. Explicar
 * um destinatario uma vez tira ele das proximas. Sem nada pendente, nao manda.
 * Protegido por x-cron-secret.
 */
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOUSEHOLD_OWNER_ID, DEFAULT_MEMBER } from '@/lib/members'
import { fetchAllPages } from '@/lib/paginate'
import { destinatario, misteriosos } from '@/lib/nome-misterioso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BRL = (cents: number) => (Math.abs(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

interface Row {
  id: string
  transaction_date: string
  description: string | null
  note: string | null
  amount_cents: number
  // PostgREST tipa o embed como array; em runtime vem objeto.
  categories: { name: string } | { name: string }[] | null
  accounts: { name: string } | { name: string }[] | null
}

const nomeDe = (e: Row['categories']) => (Array.isArray(e) ? e[0]?.name : e?.name) ?? null

export async function POST(req: Request) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const userId = HOUSEHOLD_OWNER_ID

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 30)
  const desde = d.toISOString().slice(0, 10)
  d.setUTCDate(d.getUTCDate() + 23)
  const semanaPassada = d.toISOString().slice(0, 10)

  const [recentes, explicados] = await Promise.all([
    fetchAllPages<Row>((from, to) => supabase
      .from('transactions')
      .select('id, transaction_date, description, note, amount_cents, categories(name), accounts(name)')
      .eq('user_id', userId).eq('is_transfer', false).lt('amount_cents', 0)
      .gte('transaction_date', desde).lte('transaction_date', hoje)
      .order('id', { ascending: true }).range(from, to)),
    fetchAllPages<{ description: string | null; note: string | null }>((from, to) => supabase
      .from('transactions')
      .select('description, note')
      .eq('user_id', userId).not('note', 'is', null)
      .order('id', { ascending: true }).range(from, to)),
  ])

  const lista = misteriosos(recentes.map((t) => ({ ...t, categoria: nomeDe(t.categories) })), explicados)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))

  if (lista.length === 0) return NextResponse.json({ ok: true, enviado: false, motivo: 'nada misterioso' })

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: 'RESEND_API_KEY ausente' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  // So pra dona dos dados (pedido da pessoa 1), nao pro casal como o alerta do ritmo.
  const to = DEFAULT_MEMBER.email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

  const linhas = lista.map((t) => {
    const nome = destinatario(t.description)
    const link = `${appUrl}/dashboard/transacoes?mes=${t.transaction_date.slice(0, 7)}&q=${encodeURIComponent(nome)}`
    const [, m, dia] = t.transaction_date.split('-')
    const novo = t.transaction_date >= semanaPassada ? '' : ' <span style="color:#9ca3af;">(de novo)</span>'
    return `
    <tr>
      <td style="padding:8px 8px 8px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${dia}/${m}</td>
      <td style="padding:8px 0;font-size:15px;vertical-align:top;">
        <a href="${link}" style="color:#111;">${esc(nome)}</a>${novo}<br>
        <span style="font-size:12px;color:#9ca3af;">${esc(nomeDe(t.accounts) ?? '')}</span>
      </td>
      <td style="padding:8px 0;font-size:15px;text-align:right;vertical-align:top;"><b>${BRL(t.amount_cents)}</b></td>
    </tr>`
  }).join('')

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111;">
    <h2 style="font-size:20px;margin:0 0 4px;">De onde veio isso?</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">
      ${lista.length === 1 ? 'Um gasto' : `${lista.length} gastos`} com nome que não diz nada.
      Clica no nome e escreve uma observação enquanto ainda lembra.
    </p>
    <table style="width:100%;border-collapse:collapse;">${linhas}</table>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Toda segunda. Quem ganha observação uma vez não volta a aparecer. 💜</p>
  </div>`

  try {
    await resend.emails.send({
      from: 'Gastadeiras <onboarding@resend.dev>',
      to,
      subject: `🕵️ ${lista.length} ${lista.length === 1 ? 'gasto misterioso' : 'gastos misteriosos'} pra explicar`,
      html,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'falha ao enviar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, enviado: true, quantos: lista.length })
}
