import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Mantém a sessão do usuário atualizada — não adicione lógica entre
  // createServerClient e getUser(), pois pode causar bugs difíceis de rastrear.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Em dev (ou no ambiente de TESTE com TEST_USER_ID, ou em demo) pula as verificações de auth
  const demo = process.env.NEXT_PUBLIC_DEMO === '1'
  if (process.env.NODE_ENV !== 'development' && !process.env.TEST_USER_ID && !demo) {
    const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
    // O webhook da Pluggy é chamado sem sessão de usuário — ele se autentica
    // pelo header Bearer (PLUGGY_WEBHOOK_SECRET). Sem liberar aqui, o middleware
    // redireciona pro /auth/login e o handler nunca roda.
    const isWebhookRoute =
      request.nextUrl.pathname === '/api/pluggy/webhook'
    // As rotas de cron são chamadas pelo pg_cron, sem sessão de usuário — elas
    // se autenticam pelo header x-cron-secret. Sem liberar aqui, o middleware
    // devolve 307 pro /auth/login e o handler nunca roda: era por isso que o
    // alerta de contas fixas nunca chegou (o pg_net não segue o redirect, e
    // mesmo que seguisse receberia a página de login).
    const isCronRoute = request.nextUrl.pathname.startsWith('/api/cron/')
    const isPublicRoute =
      request.nextUrl.pathname === '/' || isAuthRoute || isWebhookRoute || isCronRoute

    if (!user && !isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    if (user && isAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Ignora arquivos estáticos e internos do Next.js
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
