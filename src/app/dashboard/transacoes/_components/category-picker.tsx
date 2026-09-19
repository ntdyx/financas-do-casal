'use client'

import { useTransition, useRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateTransactionCategory, learnTransactionCategory, createCategory, updateCategory, deleteCategory } from '../actions'

interface Category {
  id: string
  name: string
  emoji: string
  color: string
  user_id?: string | null
}

interface Props {
  txId: string
  current: { name: string; emoji: string; color: string } | null
  categories: Category[]
  /** Quando true, trocar a categoria já vira aprendizado (cria regra + aplica aos iguais). */
  learn?: boolean
}

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
]

const inputCls = 'rounded-lg border bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'

export function CategoryPicker({ txId, current, categories, learn }: Props) {
  const [open, setOpen]           = useState(false)
  const [openUp, setOpenUp]       = useState(false)
  const [creating, setCreating]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName]   = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [newName, setNewName]     = useState('')
  const [newEmoji, setNewEmoji]   = useState('')
  const [newColor, setNewColor]   = useState(COLOR_PRESETS[0])
  const [isPending, startTransition] = useTransition()
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false); setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function toggleOpen() {
    if (!open && ref.current) {
      // Abre pra cima quando não cabe embaixo (não some no fim da página).
      const rect = ref.current.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom
      setOpenUp(below < 320 && rect.top > below)
    }
    setOpen((v) => !v); setCreating(false); setEditingId(null)
  }

  function pick(categoryId: string | null) {
    setOpen(false)
    startTransition(async () => {
      await (learn ? learnTransactionCategory : updateTransactionCategory)(txId, categoryId)
      router.refresh()
    })
  }

  function startEdit(e: React.MouseEvent, cat: Category) {
    e.stopPropagation()
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditEmoji(cat.emoji)
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editName.trim()) return
    startTransition(async () => {
      await updateCategory(editingId!, editName, editEmoji)
      setEditingId(null)
      router.refresh()
    })
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    startTransition(async () => {
      await createCategory(newName, newEmoji, newColor)
      setNewName(''); setNewEmoji(''); setNewColor(COLOR_PRESETS[0])
      setCreating(false)
      router.refresh()
    })
  }

  function handleDelete(e: React.MouseEvent, catId: string) {
    e.stopPropagation()
    startTransition(async () => {
      await deleteCategory(catId)
      router.refresh()
    })
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={toggleOpen}
        disabled={isPending}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity ${isPending ? 'opacity-50' : 'hover:opacity-80'}`}
        style={{
          backgroundColor: current ? `${current.color}1f` : 'var(--line)',
          color: current?.color ?? 'var(--ink-softer)',
        }}
      >
        <span>{current?.emoji ?? '📦'}</span>
        <span>{current?.name ?? 'Categorizar'}</span>
        <span className="text-[10px] opacity-50">▾</span>
      </button>

      {open && (
        <div className={`absolute left-0 z-50 max-h-[min(70vh,340px)] w-60 overflow-y-auto overscroll-contain rounded-xl border bg-white py-1 shadow-lg ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`} style={{ borderColor: 'var(--line-strong)' }}>
          {!creating ? (
            <>
              <button onClick={() => pick(null)} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-black/[0.04]" style={{ color: 'var(--ink-soft)' }}>
                <span>📦</span> Sem categoria
              </button>
              <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />

              {categories.map((c) =>
                editingId === c.id ? (
                  <form key={c.id} onSubmit={handleEdit} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 px-2 py-1.5">
                    <input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} maxLength={2} className={`${inputCls} w-9 text-center`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} required autoFocus className={`${inputCls} min-w-0 flex-1`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
                    <button type="submit" disabled={isPending} className="shrink-0 rounded-lg bg-[var(--accent)] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">✓</button>
                    <button type="button" onClick={() => setEditingId(null)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] hover:bg-black/[0.05]" style={{ color: 'var(--ink-soft)' }}>✕</button>
                  </form>
                ) : (
                  <div key={c.id} className="group flex items-center">
                    <button onClick={() => pick(c.id)} className="flex flex-1 items-center gap-2 px-3 py-2 text-sm hover:bg-black/[0.04]" style={{ color: 'var(--ink-2)' }}>
                      <span>{c.emoji}</span> {c.name}
                    </button>
                    <div className="mr-1.5 hidden items-center gap-0.5 group-hover:flex">
                      <button onClick={(e) => startEdit(e, c)} className="rounded p-1 hover:text-[var(--ink)]" style={{ color: 'var(--ink-softer)' }} title="Editar"><PencilIcon /></button>
                      {c.user_id && (
                        <button onClick={(e) => handleDelete(e, c.id)} className="rounded p-1 hover:text-red-500" style={{ color: 'var(--ink-softer)' }} title="Remover"><TrashIcon /></button>
                      )}
                    </div>
                  </div>
                )
              )}

              <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />
              <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-black/[0.04]" style={{ color: 'var(--accent)' }}>
                <span>＋</span> Nova categoria
              </button>
            </>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col gap-2 p-3">
              <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Nova categoria</p>
              <div className="flex gap-2">
                <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="🏷️" maxLength={2} className={`${inputCls} w-11 text-center`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome" required autoFocus className={`${inputCls} flex-1`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewColor(c)} className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                    style={{ background: c, outline: newColor === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button type="submit" disabled={isPending || !newName.trim()} className="flex-1 rounded-lg bg-[var(--accent)] py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {isPending ? '…' : 'Criar'}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-xs hover:bg-black/[0.05]" style={{ color: 'var(--ink-soft)' }}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  )
}
