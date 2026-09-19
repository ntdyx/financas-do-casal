import { createClient } from '@supabase/supabase-js'
import { IS_DEMO } from '../demo/mode'
import { createFakeClient } from '../demo/fake-supabase'

/**
 * Client com service role — bypassa RLS.
 * Use APENAS em contextos server-side sem sessão de usuário (ex: webhooks).
 * NUNCA exponha no cliente.
 */
export function createAdminClient() {
  if (IS_DEMO) return createFakeClient() as unknown as ReturnType<typeof createClient>

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
