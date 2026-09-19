/**
 * Household (casal): os dados são COMPARTILHADOS sob um único dono, e as duas
 * pessoas logam com a própria conta. O login serve pra atribuir cada ação a
 * quem fez (Histórico) e mostrar a foto certa — os dados são os mesmos pras duas.
 *
 * Só servidor (lê variáveis sem NEXT_PUBLIC): HOUSEHOLD_OWNER_ID, PESSOA1_EMAIL e
 * PESSOA2_EMAIL. Nomes e fotos vêm de src/lib/casal.ts.
 */
import { P1, P2 } from './casal'

// Todos os dados (contas, transações, regras…) vivem sob este user_id.
export const HOUSEHOLD_OWNER_ID = process.env.HOUSEHOLD_OWNER_ID?.trim() ?? ''

export interface Member {
  name: string
  email: string
  photo: string | null
  initial: string
}

const EMAIL1 = process.env.PESSOA1_EMAIL?.trim() ?? ''
const EMAIL2 = process.env.PESSOA2_EMAIL?.trim() ?? ''

export const MEMBERS: Member[] = [
  { name: P1.name, email: EMAIL1, photo: P1.photo, initial: P1.initial },
  { name: P2.name, email: EMAIL2, photo: P2.photo, initial: P2.initial },
]

export const DEFAULT_MEMBER = MEMBERS[0]

const byEmail = new Map(MEMBERS.filter((m) => m.email).map((m) => [m.email.toLowerCase(), m]))
const byName = new Map(MEMBERS.map((m) => [m.name.toLowerCase(), m]))

export const memberByEmail = (e?: string | null): Member | null =>
  e ? byEmail.get(e.toLowerCase()) ?? null : null
export const memberByName = (n?: string | null): Member | null =>
  n ? byName.get(n.toLowerCase()) ?? null : null
