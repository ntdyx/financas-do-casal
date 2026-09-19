import { createClient } from './supabase/server'
import { HOUSEHOLD_OWNER_ID, DEFAULT_MEMBER, memberByEmail, type Member } from './members'
import { IS_DEMO, DEMO_OWNER_ID } from './demo/mode'

// UUID fixo para modo dev — queries retornam vazio (empty states), sem crash
const DEV_USER_ID = '5d063def-cb69-4823-9d94-a736a85d29e3'

export interface SessionUser {
  id: string       // dono dos dados (household) — usado em todas as queries
  email: string
  actor: Member    // quem está logado (atribuição + foto)
}

export async function getUser(): Promise<SessionUser | null> {
  // Modo demo: entra direto com usuário fixo, sem sessão real.
  if (IS_DEMO) {
    return { id: DEMO_OWNER_ID, email: 'demo@demo.local', actor: DEFAULT_MEMBER }
  }

  // Ambiente de TESTE: deploy separado com TEST_USER_ID entra direto (sem login),
  // com sua própria cópia de dados. Atribui como pessoa 1 por padrão.
  if (process.env.TEST_USER_ID) {
    return { id: process.env.TEST_USER_ID, email: 'teste@financas-do-casal.app', actor: DEFAULT_MEMBER }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // dados sempre sob o dono do household; actor = quem logou (pessoa 1/pessoa 2)
    const actor = memberByEmail(user.email) ?? DEFAULT_MEMBER
    return { id: HOUSEHOLD_OWNER_ID, email: user.email ?? actor.email, actor }
  }

  if (process.env.NODE_ENV === 'development') {
    return { id: DEV_USER_ID, email: 'dev@financas-do-casal.local', actor: DEFAULT_MEMBER }
  }

  return null
}
