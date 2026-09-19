import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth'
import { createConnectToken } from '@/lib/pluggy'

export async function GET() {
  const user = await getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const accessToken = await createConnectToken(user.id)
    return NextResponse.json({ accessToken })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
