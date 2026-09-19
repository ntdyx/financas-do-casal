'use client'

import { P1, P2 } from '@/lib/casal'
import { useState, useTransition } from 'react'
import { addManualTransaction } from '../actions'

interface Category { id: string; name: string; emoji: string }

const SPLIT_OPTIONS = [
  { label: 'Não dividir', value: '' },
  { label: `100% ${P1.name}`, value: '100' },
  { label: '50% / 50%', value: '50' },
  { label: `75% ${P2.name} / 25% ${P1.name}`, value: '25' },
  { label: `100% ${P2.name}`, value: '0' },
]

const inputCls = 'w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
const inputStyle = { borderColor: 'var(--line-strong)', color: 'var(--ink)' }
const labelCls = 'mb-1 block text-xs'
const labelStyle = { color: 'var(--ink-soft)' }

export function AddTransactionForm({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [payer, setPayer] = useState<'me' | 'pessoa2'>('me')

  const today = new Date().toISOString().slice(0, 10)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await addManualTransaction(fd)
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="gd-btn primary text-sm">
        <span className="text-base leading-none">＋</span>
        Gasto manual
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="gd-card mb-6 w-full">
      <input type="hidden" name="type" value="expense" />
      <p className="mb-4 text-sm font-semibold" style={{ color: 'var(--ink)' }}>Novo gasto manual</p>

      {/* Quem pagou */}
      <div className="mb-4 flex overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line-strong)' }}>
        {(['me', 'pessoa2'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPayer(p)}
            className="flex-1 py-2 text-sm font-semibold transition-colors"
            style={payer === p ? { background: 'var(--accent)', color: '#fff' } : { background: 'transparent', color: 'var(--ink-soft)' }}
          >
            {p === 'me' ? 'Eu paguei' : `${P2.name} pagou`}
          </button>
        ))}
        <input type="hidden" name="payer" value={payer} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} style={labelStyle}>Descrição *</label>
          <input name="description" required placeholder="Ex: Jantar restaurante X" className={inputCls} style={inputStyle} />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Valor (R$) *</label>
          <input name="amount" required type="text" placeholder="Ex: 89,90" className={inputCls} style={inputStyle} />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Data *</label>
          <input name="date" required type="date" defaultValue={today} className={inputCls} style={inputStyle} />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Categoria</label>
          <select name="category_id" defaultValue="" className={inputCls} style={inputStyle}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Divisão</label>
          <select name="split_mine_pct" defaultValue="" className={inputCls} style={inputStyle}>
            {SPLIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} style={labelStyle}>Observação</label>
          <input name="note" placeholder="opcional" className={inputCls} style={inputStyle} />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={isPending} className="gd-btn accent text-sm disabled:opacity-50">
          {isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="gd-btn text-sm">Cancelar</button>
      </div>
    </form>
  )
}
