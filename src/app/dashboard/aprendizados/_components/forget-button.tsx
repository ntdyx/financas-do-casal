'use client'

import { useTransition } from 'react'
import { forgetRule } from '../actions'

export function ForgetButton({ pattern }: { pattern: string }) {
  const [isPending, startTransition] = useTransition()

  function handle() {
    startTransition(() => forgetRule(pattern))
  }

  return (
    <button
      onClick={handle}
      disabled={isPending}
      title="Esquecer este aprendizado"
      className="cursor-pointer rounded-lg px-2 py-1 transition-colors hover:text-red-600 disabled:opacity-50"
      style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}
    >
      {isPending ? '…' : 'Esquecer'}
    </button>
  )
}
