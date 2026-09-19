'use client'

import { useState, useTransition } from 'react'
import { undoLastReview } from '../../transacoes/actions'

export function UndoButton() {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function handle() {
    setMsg(null)
    startTransition(async () => {
      const { undone } = await undoLastReview()
      setMsg(undone ? '↩ última revisão desfeita' : 'nada pra desfazer')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={handle} disabled={isPending} className="gd-btn text-sm disabled:opacity-50" title="Desfazer a última revisão (ctrl+z)">
        {isPending ? '…' : '↩ Desfazer revisão'}
      </button>
      {msg && <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{msg}</span>}
    </div>
  )
}
