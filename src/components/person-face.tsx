/**
 * Avatar de cada pessoa do casal — imagem redonda no lugar da letra.
 * A foto vem de src/lib/casal.ts; sem foto, mostra a inicial.
 * A imagem preenche o chip (redondo) em qualquer tamanho.
 */
import { P1, P2 } from '@/lib/casal'

export type Who = 'nat' | 'jen'

const PESSOA = { nat: P1, jen: P2 } as const

interface Props {
  who: Who
  className?: string
}

export function PersonFace({ who, className }: Props) {
  const p = PESSOA[who]
  if (!p.photo) {
    return (
      <span aria-hidden="true" className={className ?? 'flex h-full w-full items-center justify-center rounded-full'}>
        {p.initial}
      </span>
    )
  }
  return (
    <img
      src={p.photo}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className ?? 'h-full w-full rounded-full object-cover'}
    />
  )
}
