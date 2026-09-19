import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from './admin'
import { IS_DEMO } from '@/lib/demo/mode'
import { createFakeClient } from '@/lib/demo/fake-supabase'

export async function createClient() {
  if (IS_DEMO) return createFakeClient() as unknown as ReturnType<typeof createAdminClient>

  // Em dev (ou no ambiente de TESTE com TEST_USER_ID) não há sessão Supabase
  // real → RLS bloquearia tudo. O admin client bypassa RLS; o app sempre filtra
  // por user.id (do getUser), então só vê os dados daquele usuário.
  if (process.env.NODE_ENV === 'development' || process.env.TEST_USER_ID) {
    return createAdminClient()
  }

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component — cookies só podem ser definidos em
            // Server Actions ou Route Handlers. Ignorado aqui com segurança.
          }
        },
      },
    },
  )
}
