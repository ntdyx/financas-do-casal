'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { assignFixedBill, clearFixedBill, toggleTransfer, deleteManualTransaction, type FixedBillRow } from '../actions'
import { FixedBillDialog } from './fixed-bill-dialog'

interface Props {
  txId: string
  fixedBillId: string | null
  bills: FixedBillRow[]
  isTransfer: boolean
  isManual: boolean
}

/**
 * Ações secundárias de cada gasto agrupadas num menu "⋯" — em vez de
 * vários ícones soltos (📌 / ⇄ / 🗑) que ninguém entende sem passar o mouse.
 * "Gasto fixo" abre uma janela pra escolher QUAL conta fixa é este gasto.
 */
export function RowActionsMenu({ txId, fixedBillId, bills, isTransfer, isManual }: Props) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [isPending, start] = useTransition()
  const currentBill = bills.find((b) => b.id === fixedBillId) ?? null

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleFixedSelect(billId: string | null) {
    start(() => (billId ? assignFixedBill(txId, billId) : clearFixedBill(txId)))
  }

  function handleTransfer() {
    setOpen(false)
    start(() => toggleTransfer(txId, !isTransfer))
  }

  function handleDelete() {
    setOpen(false)
    if (!confirm('Remover este lançamento manual?')) return
    start(() => deleteManualTransaction(txId))
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-label="Mais ações"
        title="Mais ações"
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/[0.05] disabled:opacity-50"
        style={{ color: 'var(--ink-soft)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-2xl border bg-white py-1.5 shadow-lg"
          style={{ borderColor: 'var(--line-strong)' }}
        >
          <MenuItem
            onClick={() => { setOpen(false); setDialog(true) }}
            icon={currentBill?.emoji ?? '📌'}
            label={currentBill ? `Conta fixa: ${currentBill.name}` : 'Gasto fixo'}
            hint={currentBill ? 'Trocar ou tirar a conta fixa' : 'Definir qual conta fixa é'}
            active={!!currentBill}
          />
          <MenuItem
            onClick={handleTransfer}
            icon="↔"
            label="Não é um gasto"
            hint="Transferência ou fatura"
          />

          {isManual && (
            <>
              <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-red-50 disabled:opacity-50"
                style={{ color: 'var(--negative)' }}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center">
                  <TrashIcon />
                </span>
                Excluir lançamento
              </button>
            </>
          )}
        </div>
      )}

      {dialog && (
        <FixedBillDialog
          bills={bills}
          currentBillId={fixedBillId}
          onSelect={handleFixedSelect}
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  icon,
  label,
  hint,
  active = false,
}: {
  onClick: () => void
  icon: string
  label: string
  hint: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/[0.04]"
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm"
        style={active ? { background: 'var(--accent-soft)' } : { background: 'var(--line)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {label}
        </span>
        <span className="block text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          {hint}
        </span>
      </span>
      {active && (
        <span className="shrink-0 text-sm font-bold" style={{ color: 'var(--accent)' }}>
          ✓
        </span>
      )}
    </button>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}
