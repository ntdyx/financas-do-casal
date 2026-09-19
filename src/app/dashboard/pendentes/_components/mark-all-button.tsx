'use client'

import { useTransition } from 'react'
import { markAllReviewed } from '../../transacoes/actions'

export function MarkAllButton() {
  const [isPending, startTransition] = useTransition()

  function handle() {
    if (!confirm('Marcar TODAS as pendentes como revisadas?')) return
    startTransition(() => markAllReviewed())
  }

  return (
    <button onClick={handle} disabled={isPending} className="gd-btn text-sm disabled:opacity-50">
      {isPending ? 'Revisando…' : '✓ Revisar todas'}
    </button>
  )
}
