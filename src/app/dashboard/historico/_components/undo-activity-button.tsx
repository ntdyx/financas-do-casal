'use client'

import { useState, useTransition } from 'react'
import { undoActivity } from '../actions'

export function UndoActivityButton({ logId }: { logId: string }) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function handle() {
    startTransition(async () => {
      const r = await undoActivity(logId)
      setMsg(r.ok ? 'desfeito ✓' : (r.reason ?? 'não deu'))
    })
  }

  if (msg) return <span className="text-xs" style={{ color: 'var(--ink-softer)' }}>{msg}</span>

  return (
    <button
      onClick={handle}
      disabled={isPending}
      className="rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-black/[0.05] disabled:opacity-50"
      style={{ color: 'var(--accent)' }}
    >
      {isPending ? '…' : '↩ desfazer'}
    </button>
  )
}
