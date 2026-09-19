'use client'

import { P1, P2 } from '@/lib/casal'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPlannedBill, deletePlannedBill, togglePlannedBill } from '../actions'
import { Money } from '@/components/money'
import type { PlannedBill } from '../_lib/planned'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const RECORRENCIAS: { value: PlannedBill['recurrence']; label: string }[] = [
  { value: 'yearly', label: 'Anual' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'once', label: 'Uma vez' },
]

const SPLIT_OPTIONS = [
  { label: 'Não dividir (pessoal)', value: '' },
  { label: `100% ${P1.name}`, value: '100' },
  { label: '50% / 50%', value: '50' },
  { label: `75% ${P2.name} / 25% ${P1.name}`, value: '25' },
  { label: `100% ${P2.name}`, value: '0' },
]

const inputCls = 'w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
const inputStyle = { borderColor: 'var(--line-strong)', color: 'var(--ink)' }
const labelCls = 'mb-1 block text-xs'
const labelStyle = { color: 'var(--ink-soft)' }

function recurrenceLabel(r: PlannedBill['recurrence']) {
  return RECORRENCIAS.find((o) => o.value === r)?.label ?? r
}

/**
 * CRUD dos "trombadões" (planned_bills): form de criação + lista com
 * apagar/ativar-desativar. Fica recolhido por padrão pra não competir
 * com o corredor de meses.
 */
export function PlannedBillsManager({ bills }: { bills: PlannedBill[] }) {
  const [recurrence, setRecurrence] = useState<PlannedBill['recurrence']>('yearly')
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const router = useRouter()

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    startTransition(async () => {
      await createPlannedBill(fd)
      form.reset()
      setRecurrence('yearly')
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    setPendingId(id)
    startTransition(async () => {
      await deletePlannedBill(id)
      router.refresh()
      setPendingId(null)
    })
  }

  function handleToggle(id: string, active: boolean) {
    setPendingId(id)
    startTransition(async () => {
      await togglePlannedBill(id, !active)
      router.refresh()
      setPendingId(null)
    })
  }

  return (
    <details className="gd-card">
      <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        Contas previstas
      </summary>

      <div className="mt-4 space-y-4">
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} style={labelStyle}>Emoji</label>
            <input name="emoji" placeholder="🚗" maxLength={2} defaultValue="💸" className={`${inputCls} text-center`} style={inputStyle} />
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Nome *</label>
            <input name="name" required placeholder="Ex: IPVA" className={inputCls} style={inputStyle} />
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Valor total (R$) *</label>
            <input name="amount" required type="number" step="0.01" min="0" placeholder="Ex: 3000" className={inputCls} style={inputStyle} />
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Recorrência</label>
            <select
              name="recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as PlannedBill['recurrence'])}
              className={inputCls}
              style={inputStyle}
            >
              {RECORRENCIAS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Mês</label>
            <select name="month" defaultValue="1" className={inputCls} style={inputStyle}>
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {recurrence === 'once' && (
            <div>
              <label className={labelCls} style={labelStyle}>Ano</label>
              <input name="year" type="number" placeholder="Ex: 2026" className={inputCls} style={inputStyle} />
            </div>
          )}

          <div>
            <label className={labelCls} style={labelStyle}>Parcelas</label>
            <input name="installments" type="number" min="1" defaultValue="1" className={inputCls} style={inputStyle} />
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Divisão</label>
            <select name="split" defaultValue="" className={inputCls} style={inputStyle}>
              {SPLIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button type="submit" disabled={isPending} className="gd-btn accent text-sm disabled:opacity-50">
              {isPending && !pendingId ? 'Salvando…' : '＋ Cadastrar trombadão'}
            </button>
          </div>
        </form>

        {bills.length > 0 ? (
          <ul className="space-y-1">
            {bills.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
                style={{ background: 'var(--rail)', opacity: b.active ? 1 : 0.5 }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span>{b.emoji}</span>
                  <span className="truncate font-medium" style={{ color: 'var(--ink)' }}>{b.name}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>
                    {recurrenceLabel(b.recurrence)} · {MESES[b.month - 1]}
                    {b.recurrence === 'once' && b.year ? `/${b.year}` : ''}
                    {b.installments > 1 ? ` · ${b.installments}x` : ''}
                  </span>
                </span>
                <Money cents={b.amount_cents} />
                <button
                  type="button"
                  onClick={() => handleToggle(b.id, b.active)}
                  disabled={isPending}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium hover:bg-black/[0.05] disabled:opacity-50"
                  style={{ color: b.active ? 'var(--accent)' : 'var(--ink-soft)' }}
                  title={b.active ? 'Desativar' : 'Ativar'}
                >
                  {b.active ? 'Ativo' : 'Inativo'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id)}
                  disabled={isPending}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium hover:bg-black/[0.05] disabled:opacity-50"
                  style={{ color: 'var(--negative)' }}
                  title="Apagar"
                >
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Nenhum trombadão cadastrado ainda.</p>
        )}
      </div>
    </details>
  )
}
