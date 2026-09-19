'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { updateTransactionNote } from '../actions'

interface Props {
  txId: string
  current: string | null
  /** quando a observação já aparece como NOME do gasto, não repete o texto aqui */
  hideValue?: boolean
}

export function NoteInput({ txId, current, hideValue = false }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(current ?? '')
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  function save() {
    setOpen(false)
    startTransition(() => updateTransactionNote(txId, value))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
    if (e.key === 'Escape') setOpen(false)
  }

  const hasNote = (current ?? '').trim().length > 0

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={hasNote ? current! : 'Adicionar observação'}
        className={`flex items-center gap-1 text-[10px] transition-colors ${isPending ? 'opacity-50' : ''}`}
        style={{ color: hasNote ? 'var(--ink-soft)' : 'var(--ink-softer)' }}
      >
        <NoteIcon />
        {hasNote && !hideValue && <span className="max-w-[140px] truncate">{current}</span>}
      </button>
    )
  }

  return (
    <div className="mt-1 flex w-full items-start gap-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={save}
        rows={2}
        placeholder="Observação… (Enter para salvar)"
        className="w-full resize-none rounded-lg border bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
        style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }}
      />
    </div>
  )
}

function NoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}
