'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeMonth, reopenMonth } from '../actions'

export function CloseButton({ mes, disabled }: { mes: string; disabled?: boolean }) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function close() {
    if (!confirm('Fechar este mês? Isso salva um resumo do acerto. Você pode reabrir depois.')) return
    setErr(null)
    start(async () => {
      const r = await closeMonth(mes)
      if (r.error) setErr(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={close}
        disabled={disabled || isPending}
        className="gd-btn accent text-sm disabled:opacity-50"
      >
        {isPending ? 'Fechando…' : '🔒 Fechar mês (acertei)'}
      </button>
      {err && <span className="text-xs font-medium text-red-600">{err}</span>}
    </div>
  )
}

export function ReopenButton({ mes }: { mes: string }) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // `reopenMonth` devolve { error } e o erro estava sendo descartado: o mês
  // continuava fechado e nada aparecia na tela. Mesmo padrão do CloseButton.
  function reopen() {
    if (!confirm('Reabrir este mês? O resumo salvo será removido e o mês volta a "em aberto".')) return
    setErr(null)
    start(async () => {
      const r = await reopenMonth(mes)
      if (r.error) setErr(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button onClick={reopen} disabled={isPending} className="gd-btn text-sm disabled:opacity-50">
        {isPending ? 'Reabrindo…' : '↩ Reabrir mês'}
      </button>
      {err && <span className="text-xs font-medium text-red-600">{err}</span>}
    </div>
  )
}
