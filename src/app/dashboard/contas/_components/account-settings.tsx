'use client'

import { P2 } from '@/lib/casal'
import { useState, useTransition } from 'react'
import { updateAccountSettings } from '../actions'

type Owner = 'me' | 'pessoa2' | 'shared'

const OWNER_OPTIONS: { value: Owner; label: string; color: string }[] = [
  { value: 'me',      label: '👩‍💻 Minha',        color: 'var(--na)' },
  { value: 'shared',  label: '🤝 Compartilhada',  color: 'var(--warn)' },
  { value: 'pessoa2', label: `👩 ${P2.name}`,         color: 'var(--je)' },
]

const SPLIT_OPTIONS = [
  { label: 'Sem split padrão', value: null },
  { label: `50% eu / 50% ${P2.name}`, value: 50 },
  { label: `40% eu / 60% ${P2.name}`, value: 40 },
  { label: `30% eu / 70% ${P2.name}`, value: 30 },
  { label: `20% eu / 80% ${P2.name}`, value: 20 },
  { label: `0% eu / 100% ${P2.name}`, value: 0 },
]

interface Props {
  accountId: string
  currentOwner: Owner
  currentSplitMinePct: number | null
}

export function AccountSettings({ accountId, currentOwner, currentSplitMinePct }: Props) {
  const [open, setOpen] = useState(false)
  const [owner, setOwner] = useState<Owner>(currentOwner)
  const [splitPct, setSplitPct] = useState<number | null>(currentSplitMinePct)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateAccountSettings(accountId, owner, splitPct)
      setOpen(false)
    })
  }

  // Conta sem `owner` (ou com valor fora da lista) existe: o resto do app trata
  // com `?? 'me'`. Aqui o `!` derrubava a tela inteira do dashboard ao abrir
  // "configurar", porque não há error boundary nesse caminho.
  const ownerOption = OWNER_OPTIONS.find((o) => o.value === currentOwner) ?? OWNER_OPTIONS[0]

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: ownerOption.color }}
        title="Configurar conta"
      >
        {ownerOption.label}
        {currentSplitMinePct !== null && (
          <span className="ml-1" style={{ color: 'var(--ink-soft)' }}>· split {currentSplitMinePct}/{100 - currentSplitMinePct}</span>
        )}
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Configurações da conta</p>

      <div className="mb-3">
        <p className="mb-1 text-[10px]" style={{ color: 'var(--ink-soft)' }}>Responsável</p>
        <div className="flex gap-1">
          {OWNER_OPTIONS.map((o) => {
            const active = owner === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setOwner(o.value)
                  // Auto-sugere split 50 para compartilhada
                  if (o.value === 'shared' && splitPct === null) setSplitPct(50)
                  if (o.value === 'me') setSplitPct(null)
                }}
                className="flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? 'var(--ink)' : 'var(--surface)',
                  color: active ? '#fff' : 'var(--ink-soft)',
                  border: '1px solid var(--line)',
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-[10px]" style={{ color: 'var(--ink-soft)' }}>Split padrão (novas transações)</p>
        <select
          value={splitPct ?? ''}
          onChange={(e) => setSplitPct(e.target.value === '' ? null : parseInt(e.target.value))}
          className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
          style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' }}
        >
          {SPLIT_OPTIONS.map((o) => (
            <option key={String(o.value)} value={o.value ?? ''}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-xs transition-colors hover:opacity-80"
          style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
