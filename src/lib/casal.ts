/**
 * Quem é o casal. Pode ser importado em Client Component (só usa NEXT_PUBLIC_*).
 *
 * P1 é a dona dos dados (owner 'me', split_mine_pct = parte dela); P2 é a outra
 * (owner 'pessoa2' no banco).
 *
 * Nomes em NEXT_PUBLIC_PESSOA1_NOME / NEXT_PUBLIC_PESSOA2_NOME e, se quiser foto,
 * NEXT_PUBLIC_PESSOA1_FOTO / NEXT_PUBLIC_PESSOA2_FOTO (caminho em /public ou URL).
 * Sem foto, o avatar mostra a inicial.
 */
export interface Pessoa {
  name: string
  short: string   // 3 letras, pros chips apertados ("75% P2")
  initial: string
  photo: string | null
}

// process.env.NEXT_PUBLIC_* precisa aparecer literal pra o Next embutir no cliente.
const NOME1 = process.env.NEXT_PUBLIC_PESSOA1_NOME?.trim()
const NOME2 = process.env.NEXT_PUBLIC_PESSOA2_NOME?.trim()
const FOTO1 = process.env.NEXT_PUBLIC_PESSOA1_FOTO?.trim()
const FOTO2 = process.env.NEXT_PUBLIC_PESSOA2_FOTO?.trim()

function pessoa(nome: string, foto: string | null): Pessoa {
  return { name: nome, short: nome.slice(0, 3), initial: nome.charAt(0).toUpperCase(), photo: foto }
}

export const P1: Pessoa = pessoa(NOME1 || 'Pessoa 1', FOTO1 || null)
export const P2: Pessoa = pessoa(NOME2 || 'Pessoa 2', FOTO2 || null)

/** Rótulos das divisões (split_mine_pct = parte da P1). */
export const SPLIT_LABEL: Record<'100' | '50' | '25' | '0', string> = {
  '100': `100% ${P1.name}`,
  '50': '50% / 50%',
  '25': `75% ${P2.name} / 25% ${P1.name}`,
  '0': `100% ${P2.name}`,
}
