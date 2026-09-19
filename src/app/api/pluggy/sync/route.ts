import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { syncItem } from '@/lib/sync'

export async function POST(request: Request) {
  const user = await getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await request.json()
  if (!itemId) {
    return NextResponse.json({ error: 'itemId obrigatório' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const synced = await syncItem(itemId, user.id, supabase)
    return NextResponse.json({ ok: true, synced })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
