/**
 * GET /api/pluggy/register-webhook
 *
 * Registra (ou atualiza) o webhook global na Pluggy para receber eventos
 * de todas as contas. Chame uma vez após o deploy de produção.
 *
 * Requer: NEXT_PUBLIC_APP_URL, PLUGGY_WEBHOOK_SECRET
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  // Só permite admin autenticado
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.PLUGGY_WEBHOOK_SECRET

  if (!appUrl || !webhookSecret) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL ou PLUGGY_WEBHOOK_SECRET não configurados' },
      { status: 500 },
    )
  }

  // Busca apiKey
  const authRes = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID!,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
    }),
    cache: 'no-store',
  })
  if (!authRes.ok) {
    return NextResponse.json({ error: 'Pluggy auth falhou' }, { status: 500 })
  }
  const { apiKey } = await authRes.json()

  // Registra webhook global — recebe transactions/created e item/updated
  const webhookRes = await fetch('https://api.pluggy.ai/webhooks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      url: `${appUrl}/api/pluggy/webhook`,
      event: 'all',
      headers: {
        Authorization: `Bearer ${webhookSecret}`,
      },
    }),
    cache: 'no-store',
  })

  const result = await webhookRes.json()

  if (!webhookRes.ok) {
    return NextResponse.json({ error: result }, { status: 500 })
  }

  return NextResponse.json({ ok: true, webhook: result })
}
