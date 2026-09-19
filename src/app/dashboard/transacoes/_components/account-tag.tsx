import { P1, P2 } from '@/lib/casal'
import { PersonFace, type Who } from '@/components/person-face'

interface Props {
  name: string
  type: 'credit' | 'checking'
  owner: 'me' | 'pessoa2' | 'shared' | null
}

function detectBank(name: string): { abbr: string; bg: string; fg: string } {
  const n = name.toLowerCase()
  if (n.includes('nubank'))                              return { abbr: 'Nu', bg: '#8A05BE', fg: '#fff' }
  if (n.includes('xp'))                                  return { abbr: 'XP', bg: '#111',    fg: '#fff' }
  if (n.includes('infinitepay') || n.includes('infinite')) return { abbr: 'IP', bg: '#00B37E', fg: '#fff' }
  if (n.includes('itaú') || n.includes('itau'))          return { abbr: 'It', bg: '#EC7000', fg: '#fff' }
  if (n.includes('bradesco'))                            return { abbr: 'Br', bg: '#CC092F', fg: '#fff' }
  if (n.includes('inter'))                               return { abbr: 'In', bg: '#FF7A00', fg: '#fff' }
  if (n.includes('santander'))                           return { abbr: 'Sa', bg: '#CC0000', fg: '#fff' }
  if (n.includes('caixa'))                               return { abbr: 'Ca', bg: '#005CA9', fg: '#fff' }
  if (n.includes('brasil') || n.includes(' bb'))         return { abbr: 'BB', bg: '#FBBA00', fg: '#000' }
  if (n.includes('c6'))                                  return { abbr: 'C6', bg: '#242424', fg: '#F5E642' }
  if (n.includes('pagseguro') || n.includes('pagbank')) return { abbr: 'PB', bg: '#009B3A', fg: '#fff' }
  if (n.includes('sicoob'))                              return { abbr: 'Si', bg: '#005236', fg: '#fff' }
  if (n.includes('sicredi'))                             return { abbr: 'Sc', bg: '#00783E', fg: '#fff' }
  return { abbr: name.slice(0, 2).toUpperCase(), bg: '#3f3f46', fg: '#a1a1aa' }
}

const OWNER: Record<string, { bg: string; initial: string; who: Who | null }> = {
  me:      { bg: 'var(--na)', initial: P1.initial, who: 'nat' },
  pessoa2: { bg: 'var(--je)', initial: P2.initial, who: 'jen' },
  shared:  { bg: 'var(--ink-2)', initial: '½', who: null },
}

export function AccountTag({ name, type: _type, owner }: Props) {
  const bank  = detectBank(name)
  const ownerStyle = owner ? OWNER[owner] : OWNER.me

  return (
    <span className="inline-flex items-center gap-1">
      {/* banco */}
      <span
        className="inline-flex h-4 items-center rounded px-1 text-[9px] font-bold leading-none"
        style={{ background: bank.bg, color: bank.fg }}
      >
        {bank.abbr}
      </span>
      {/* dono */}
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: ownerStyle.bg }}
      >
        {ownerStyle.who ? <PersonFace who={ownerStyle.who} /> : ownerStyle.initial}
      </span>
    </span>
  )
}
