'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleTransfer } from '../../transacoes/actions'

/**
 * "⇄ é entrada": traz de volta uma entrada que foi escondida como transferência
 * interna. Além de desmarcar este lançamento, o `toggleTransfer(false)` grava uma
 * exceção — sem ela o próximo sync re-escondia pela regra de nome do casal.
 */
export function UnhideButton({ txId }: { txId: string }) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  return (
    <button
      onClick={() => {
        setErr(null)
        start(async () => {
          try {
            await toggleTransfer(txId, false)
            router.refresh()
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'não deu')
          }
        })
      }}
      disabled={isPending}
      title={err ?? 'É entrada de verdade — trazer de volta'}
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{
        background: err ? 'var(--accent-soft)' : 'var(--je-soft)',
        color: err ? 'var(--accent)' : 'var(--je)',
      }}
    >
      {isPending ? '…' : err ? 'erro' : '⇄ é entrada'}
    </button>
  )
}
