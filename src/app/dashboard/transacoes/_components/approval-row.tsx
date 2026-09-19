'use client'

import { P1, P2 } from '@/lib/casal'
import { useState, useTransition } from 'react'
import { Money } from '@/components/money'
import { prettyName } from '@/lib/merchants'
import { effectiveName } from '@/lib/rules'
import { AccountTag } from './account-tag'
import { FixedBillDialog } from './fixed-bill-dialog'
import { approveTransaction, getSimilarPending, type SimilarTx, type FixedBillRow } from '../actions'

const SPLITS = [
  { v: '', label: '— divisão' },
  { v: '100', label: `100% ${P1.name}` },
  { v: '50', label: '50% / 50%' },
  { v: '25', label: `75% ${P2.name} / 25% ${P1.name}` },
  { v: '0', label: `100% ${P2.name}` },
]

const SPLIT_SHORT: Record<string, string> = { '100': `100% ${P1.name}`, '50': '50/50', '25': `75% ${P2.short}`, '0': `100% ${P2.name}` }
function splitLabel(p: number | null): string {
  return p == null ? 'sem divisão' : (SPLIT_SHORT[String(p)] ?? `${p}%`)
}
function dateLabel(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

interface Cat { id: string; name: string; emoji: string; color: string }

const inputCls = 'rounded-lg border bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
const inputStyle = { borderColor: 'var(--line-strong)', color: 'var(--ink)' } as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ApprovalRow({ tx, categories, bills, similarCount = 0 }: { tx: any; categories: Cat[]; bills: FixedBillRow[]; similarCount?: number }) {
  const cat0 = Array.isArray(tx.categories) ? tx.categories[0] : tx.categories
  const account = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts

  const [categoryId, setCategoryId] = useState<string>(cat0?.id ?? '')
  const [split, setSplit] = useState<string>(tx.split_mine_pct == null ? '' : String(tx.split_mine_pct))
  const [fixedBillId, setFixedBillId] = useState<string | null>(tx.fixed_bill_id ?? null)
  const [billDialog, setBillDialog] = useState(false)
  const [naoGasto, setNaoGasto] = useState<boolean>(false)
  const [note, setNote] = useState<string>(tx.note ?? '')
  const [isPending, start] = useTransition()
  const currentBill = bills.find((b) => b.id === fixedBillId) ?? null

  const [confirming, setConfirming] = useState(false)
  const [loadingSim, setLoadingSim] = useState(false)
  const [similars, setSimilars] = useState<SimilarTx[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function doApprove(ids: string[]) {
    setConfirming(false)
    start(() =>
      approveTransaction(tx.id, {
        categoryId: categoryId || null,
        split: split === '' ? null : parseInt(split, 10),
        fixedBillId,
        naoGasto,
        note,
        applyToIds: ids,
      }),
    )
  }

  // ao revisar: se há parecidos na fila E algo pra aplicar, mostra a lista deles
  // (a divisão pode ser diferente) pra ela escolher quais. Senão, revisa só este.
  async function onRevisar() {
    const temOQueAplicar = !!categoryId || naoGasto
    if (similarCount > 0 && temOQueAplicar) {
      setConfirming(true)
      setLoadingSim(true)
      const list = await getSimilarPending(tx.id)
      setSimilars(list)
      setSelected(new Set(list.map((s) => s.id)))
      setLoadingSim(false)
    } else {
      doApprove([])
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const toggleStyle = (on: boolean, color: string) =>
    on ? { background: `${color}1f`, color } : { color: 'var(--ink-softer)' }

  // Todo gasto precisa de divisão pra ser revisado (a não ser que seja "não é um gasto").
  const needsSplit = tx.amount_cents < 0 && split === '' && !naoGasto

  return (
    <div className="rounded-[14px] px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>{prettyName(effectiveName(tx))}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {account && (
              <AccountTag name={account.name} type={account.type as 'credit' | 'checking'} owner={(account.owner ?? 'me') as 'me' | 'pessoa2' | 'shared'} />
            )}
            {tx.installment_number && tx.total_installments && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--line)', color: 'var(--ink-soft)' }}>
                {tx.installment_number}/{tx.total_installments}
              </span>
            )}
          </div>
        </div>
        <span className="gd-mono shrink-0 text-sm font-semibold" style={{ color: 'var(--ink)' }}><Money cents={Math.abs(tx.amount_cents)} /></span>
      </div>

      {/* barra de aprovação — rascunho, nada salva até "Revisado" */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls} style={inputStyle}>
          <option value="">categoria…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <select value={split} onChange={(e) => setSplit(e.target.value)} className={inputCls} style={inputStyle}>
          {SPLITS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => setBillDialog(true)} className="rounded-lg px-2 py-1 text-[11px] font-semibold" style={toggleStyle(!!currentBill, 'var(--accent)')}>
          {currentBill ? `${currentBill.emoji} ${currentBill.name}` : '📌 fixo'}
        </button>
        <button type="button" onClick={() => setNaoGasto((n) => !n)} className="rounded-lg px-2 py-1 text-[11px] font-semibold" style={toggleStyle(naoGasto, 'var(--negative)')}>⇄ não é gasto</button>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="observação (opcional)" className={`${inputCls} min-w-[110px] flex-1`} style={inputStyle} />
        <button
          type="button"
          onClick={onRevisar}
          disabled={isPending || needsSplit}
          title={needsSplit ? 'Escolha a divisão antes de revisar' : undefined}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--positive)' }}
        >
          {isPending ? 'salvando…' : '✓ Revisado'}
        </button>
      </div>
      {needsSplit && (
        <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-softer)' }}>
          Escolha a divisão (de quem é) pra poder revisar.
        </p>
      )}

      {/* lista dos parecidos: ela escolhe quais aplicar (divisão pode diferir) */}
      {confirming && (
        <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--accent-soft)' }}>
          <p className="text-xs" style={{ color: 'var(--ink)' }}>
            Tem <b>{similarCount}</b> gasto{similarCount === 1 ? '' : 's'} parecido{similarCount === 1 ? '' : 's'} na fila (mesmo comerciante). A conta/divisão pode ser diferente — marque quais aplicar:
          </p>

          {loadingSim ? (
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>carregando…</p>
          ) : (
            <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto">
              {similars.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-xs">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                  <span className="w-12 shrink-0" style={{ color: 'var(--ink-soft)' }}>{dateLabel(s.transaction_date)}</span>
                  <AccountTag name={s.accountName} type={s.accountType} owner={s.owner} />
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--line)', color: 'var(--ink-soft)' }}>{splitLabel(s.split_mine_pct)}</span>
                  <span className="gd-mono ml-auto shrink-0 font-semibold" style={{ color: 'var(--ink)' }}><Money cents={Math.abs(s.amount_cents)} /></span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => doApprove([...selected])} disabled={isPending} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--positive)' }}>
              Aplicar aos {selected.size + 1} marcados
            </button>
            <button type="button" onClick={() => doApprove([])} disabled={isPending} className="rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)', background: 'white' }}>
              Só este
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="px-1 text-xs font-medium" style={{ color: 'var(--ink-soft)' }}>
              cancelar
            </button>
          </div>
        </div>
      )}

      {billDialog && (
        <FixedBillDialog
          bills={bills}
          currentBillId={fixedBillId}
          onSelect={(id) => setFixedBillId(id)}
          onClose={() => setBillDialog(false)}
        />
      )}
    </div>
  )
}
