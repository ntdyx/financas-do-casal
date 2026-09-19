'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createFixedBill, updateFixedBill, deleteFixedBill, type FixedBillRow } from '../actions'

interface Props {
  bills: FixedBillRow[]
  currentBillId: string | null
  /** Chamada ao escolher uma conta (id) ou tirar a marcação (null). */
  onSelect: (billId: string | null) => void
  onClose: () => void
}

const inputCls =
  'rounded-lg border bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'

/**
 * "Janela" pra definir QUAL conta fixa é este gasto. Escolhe da lista, cria uma
 * nova na hora, ou renomeia/apaga as existentes (a lista é editável). Quem
 * decide o que fazer com a escolha é o pai (aplica na hora ou guarda no rascunho).
 */
export function FixedBillDialog({ bills, currentBillId, onSelect, onClose }: Props) {
  const [localBills, setLocalBills] = useState(bills)
  const [creating, setCreating] = useState(bills.length === 0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [isPending, start] = useTransition()
  const router = useRouter()

  function beginCreate() {
    setEditingId(null); setName(''); setEmoji(''); setCreating(true)
  }
  function beginEdit(b: FixedBillRow) {
    setCreating(false); setEditingId(b.id); setName(b.name); setEmoji(b.emoji)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    start(async () => {
      const bill = await createFixedBill(name, emoji)
      setLocalBills((prev) => [...prev, bill])
      router.refresh()
      onSelect(bill.id)
    })
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !editingId) return
    start(async () => {
      await updateFixedBill(editingId, name, emoji)
      setLocalBills((prev) => prev.map((b) => (b.id === editingId ? { ...b, name: name.trim(), emoji: emoji.trim() || '📌' } : b)))
      setEditingId(null)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    start(async () => {
      await deleteFixedBill(id)
      setLocalBills((prev) => prev.filter((b) => b.id !== id))
      router.refresh()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(17,17,17,0.35)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Qual conta fixa?</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-lg hover:bg-black/[0.05]" style={{ color: 'var(--ink-soft)' }} aria-label="Fechar">✕</button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto py-1">
          {currentBillId && (
            <>
              <button
                onClick={() => { onSelect(null); onClose() }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-black/[0.04]"
                style={{ color: 'var(--negative)' }}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: 'var(--line)' }}>○</span>
                Tirar conta fixa
              </button>
              <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />
            </>
          )}

          {localBills.map((b) =>
            editingId === b.id ? (
              <form key={b.id} onSubmit={handleEdit} className="flex items-center gap-1.5 px-3 py-1.5">
                <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} className={`${inputCls} w-10 text-center`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
                <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={`${inputCls} min-w-0 flex-1`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
                <button type="submit" disabled={isPending} className="shrink-0 rounded-lg bg-[var(--accent)] px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">✓</button>
                <button type="button" onClick={() => setEditingId(null)} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] hover:bg-black/[0.05]" style={{ color: 'var(--ink-soft)' }}>✕</button>
              </form>
            ) : (
              <div key={b.id} className="group flex items-center">
                <button
                  onClick={() => { onSelect(b.id); onClose() }}
                  className="flex flex-1 items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-black/[0.04]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg text-base" style={{ background: b.id === currentBillId ? 'var(--accent-soft)' : 'var(--line)' }}>{b.emoji}</span>
                  <span className="flex-1 font-medium" style={{ color: 'var(--ink)' }}>{b.name}</span>
                  {b.id === currentBillId && <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>✓</span>}
                </button>
                <div className="mr-2 hidden items-center gap-0.5 group-hover:flex">
                  <button onClick={() => beginEdit(b)} className="rounded p-1.5 hover:text-[var(--ink)]" style={{ color: 'var(--ink-softer)' }} title="Renomear"><PencilIcon /></button>
                  <button onClick={() => handleDelete(b.id)} disabled={isPending} className="rounded p-1.5 hover:text-red-500 disabled:opacity-50" style={{ color: 'var(--ink-softer)' }} title="Apagar"><TrashIcon /></button>
                </div>
              </div>
            )
          )}
        </div>

        <div className="border-t px-3 py-2" style={{ borderColor: 'var(--line)' }}>
          {creating ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-2 p-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Nova conta fixa</p>
              <div className="flex gap-2">
                <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📌" maxLength={2} className={`${inputCls} w-11 text-center`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: Aluguel)" required autoFocus className={`${inputCls} flex-1`} style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }} />
              </div>
              <div className="flex gap-1.5">
                <button type="submit" disabled={isPending || !name.trim()} className="flex-1 rounded-lg bg-[var(--accent)] py-1.5 text-xs font-semibold text-white disabled:opacity-50">{isPending ? '…' : 'Criar e marcar'}</button>
                {localBills.length > 0 && (
                  <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-xs hover:bg-black/[0.05]" style={{ color: 'var(--ink-soft)' }}>Cancelar</button>
                )}
              </div>
            </form>
          ) : (
            <button onClick={beginCreate} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-black/[0.04]" style={{ color: 'var(--accent)' }}>
              <span>＋</span> Nova conta fixa
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  )
}
