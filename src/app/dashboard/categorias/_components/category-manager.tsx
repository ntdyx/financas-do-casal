'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createCategory, updateCategory, deleteCategory } from '../../transacoes/actions'

interface Cat { id: string; name: string; emoji: string; color: string; user_id?: string | null }

const COLORS = ['#22c55e', '#f97316', '#3b82f6', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#8b5cf6', '#71717a', '#6366f1', '#06b6d4']

const EMOJIS = [
  '🏷️', '🛒', '🍔', '🍕', '☕', '🍷', '🍺', '🥦', '🍫', '🥐', '🍿', '🧁',
  '🚗', '⛽', '🚌', '🚕', '✈️', '🅿️', '🏠', '💡', '🚿', '🛏️', '🧹', '🪴',
  '📺', '🎬', '🎵', '🎮', '📚', '🎓', '🏫', '👕', '👟', '🛍️', '👜', '💄',
  '💅', '💇', '💊', '🩺', '🏥', '🦷', '👓', '🎉', '🎁', '🌸', '🐶', '🐱',
  '📱', '💻', '🧾', '💳', '🏦', '💰', '🪙', '📈', '🔁', '📦', '💼', '🏋️',
]

const inputCls = 'rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
const inputStyle = { borderColor: 'var(--line-strong)', color: 'var(--ink)' } as const

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter()
  const [isPending, start] = useTransition()

  // criar
  const [newEmoji, setNewEmoji] = useState('🏷️')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])

  // editar
  const [editId, setEditId] = useState<string | null>(null)
  const [eEmoji, setEEmoji] = useState('')
  const [eName, setEName] = useState('')
  const [eColor, setEColor] = useState('')

  function create() {
    if (!newName.trim()) return
    start(async () => {
      await createCategory(newName, newEmoji, newColor)
      setNewName(''); setNewEmoji('🏷️'); setNewColor(COLORS[0])
      router.refresh()
    })
  }
  function startEdit(c: Cat) {
    setEditId(c.id); setEEmoji(c.emoji); setEName(c.name); setEColor(c.color)
  }
  function saveEdit() {
    if (!eName.trim()) return
    start(async () => { await updateCategory(editId!, eName, eEmoji, eColor); setEditId(null); router.refresh() })
  }
  function remove(id: string) {
    if (!confirm('Apagar esta categoria? Os gastos dela ficam sem categoria.')) return
    start(async () => { await deleteCategory(id); router.refresh() })
  }

  return (
    <div>
      {/* criar */}
      <div className="gd-card mb-6">
        <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>Nova categoria</p>
        <div className="flex flex-wrap items-center gap-2">
          <EmojiField value={newEmoji} onChange={setNewEmoji} />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da categoria" className={`${inputCls} min-w-[140px] flex-1`} style={inputStyle} />
          <Swatches value={newColor} onChange={setNewColor} />
          <button onClick={create} disabled={isPending || !newName.trim()} className="gd-btn accent text-sm disabled:opacity-50">
            {isPending ? '…' : 'Criar'}
          </button>
        </div>
      </div>

      {/* lista */}
      <div className="flex flex-col gap-2">
        {categories.map((c) => editId === c.id ? (
          <div key={c.id} className="gd-row flex flex-wrap items-center gap-2 px-4 py-3">
            <EmojiField value={eEmoji} onChange={setEEmoji} />
            <input value={eName} onChange={(e) => setEName(e.target.value)} className={`${inputCls} min-w-[140px] flex-1`} style={inputStyle} />
            <Swatches value={eColor} onChange={setEColor} />
            <button onClick={saveEdit} disabled={isPending} className="gd-btn accent text-sm">Salvar</button>
            <button onClick={() => setEditId(null)} className="gd-btn text-sm">Cancelar</button>
          </div>
        ) : (
          <div key={c.id} className="gd-row flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{ background: `${c.color}1f` }}>{c.emoji}</span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{c.name}</span>
            </span>
            <span className="flex items-center gap-1">
              <button onClick={() => startEdit(c)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-black/[0.04]" style={{ color: 'var(--ink-soft)' }}>editar</button>
              <button onClick={() => remove(c.id)} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-red-50 hover:text-red-600" style={{ color: 'var(--ink-softer)' }}>apagar</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmojiField({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Escolher emoji"
        title="Escolher emoji"
        className={`${inputCls} flex h-[38px] w-14 items-center justify-center text-lg`}
        style={inputStyle}
      >
        {value || '🏷️'}
      </button>
      {open && (
        <div
          className="absolute left-0 top-[46px] z-30 w-[264px] rounded-xl border bg-white p-2 shadow-lg"
          style={{ borderColor: 'var(--line-strong)' }}
        >
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => { onChange(em); setOpen(false) }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-lg transition-colors hover:bg-black/[0.06]"
                style={{ outline: value === em ? '2px solid var(--accent)' : 'none', outlineOffset: '-2px' }}
              >
                {em}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={2}
              placeholder="ou digite outro"
              className={`${inputCls} w-full text-center`}
              style={inputStyle}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} className="h-5 w-5 rounded-full transition-transform hover:scale-110"
          style={{ background: c, outline: value === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
      ))}
    </div>
  )
}
