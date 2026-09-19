'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Money } from '@/components/money'
import { resolveFixedBill, unresolveFixedBill, listCandidatePayments, type CandidatePayment } from '../actions'

function fmtDia(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/**
 * Resolve uma conta fixa que "não caiu" no mês (pagou em outro mês ou fora das
 * contas rastreadas): silencia o alerta com uma nota, e opcionalmente linka o
 * pagamento real só como referência. Não mexe em transação nem em totais.
 * Quando já resolvida, mostra a marca com opção de desfazer.
 */
export function ResolveFixedBill({
  billId,
  mes,
  resolved,
  note,
}: {
  billId: string
  mes: string
  resolved: boolean
  note: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, start] = useTransition()

  if (resolved) {
    return (
      <span className="flex min-w-0 shrink-0 items-center gap-1.5">
        {note && (
          <span className="max-w-[160px] truncate text-[11px]" style={{ color: 'var(--ink-soft)' }} title={note}>
            {note}
          </span>
        )}
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--je-soft)', color: 'var(--je)' }}>
          resolvida
        </span>
        <button
          onClick={() => start(async () => {
            const r = await unresolveFixedBill(billId, mes)
            if (r.error) { alert(`Não deu pra desfazer: ${r.error}`); return }
            router.refresh()
          })}
          disabled={isPending}
          title="Desfazer"
          aria-label="Desfazer resolução"
          className="shrink-0 text-[13px] hover:opacity-70 disabled:opacity-40"
          style={{ color: 'var(--ink-softer)' }}
        >
          ✕
        </button>
      </span>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        marcar paga
      </button>
      {open && <ResolveDialog billId={billId} mes={mes} onClose={() => setOpen(false)} />}
    </>
  )
}

function ResolveDialog({ billId, mes, onClose }: { billId: string; mes: string; onClose: () => void }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [txId, setTxId] = useState<string | null>(null)
  const [cands, setCands] = useState<CandidatePayment[] | null>(null)
  const [filter, setFilter] = useState('')
  const [isPending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    listCandidatePayments(mes).then(setCands)
  }, [mes])

  function pick(c: CandidatePayment) {
    if (txId === c.id) { setTxId(null); return }
    setTxId(c.id)
    if (!note.trim()) setNote(`pago ${fmtDia(c.date)}`)
  }

  // Erro aqui fechava o diálogo como se a conta tivesse sido marcada paga.
  function submit() {
    setErr(null)
    start(async () => {
      const r = await resolveFixedBill(billId, mes, note, txId)
      if (r.error) { setErr(r.error); return }
      router.refresh()
      onClose()
    })
  }

  const list = (cands ?? []).filter((c) => !filter.trim() || c.name.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(17,17,17,0.35)' }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Marcar como paga</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-lg hover:bg-black/[0.05]" style={{ color: 'var(--ink-soft)' }} aria-label="Fechar">✕</button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Explicação</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex: pago 1º de maio"
              autoFocus
              className="w-full rounded-lg border bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
              style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
              Linkar o pagamento <span style={{ color: 'var(--ink-softer)' }}>(opcional)</span>
            </p>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar gasto do mês ou vizinhos…"
              className="mb-2 w-full rounded-lg border bg-white px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
              style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)' }}
            />
            <div className="max-h-48 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--line)' }}>
              {cands === null ? (
                <p className="px-3 py-3 text-xs" style={{ color: 'var(--ink-softer)' }}>carregando…</p>
              ) : list.length === 0 ? (
                <p className="px-3 py-3 text-xs" style={{ color: 'var(--ink-softer)' }}>nenhum gasto encontrado</p>
              ) : (
                list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pick(c)}
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-black/[0.03]"
                    style={{ borderColor: 'var(--line)', background: txId === c.id ? 'var(--accent-soft)' : undefined }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[13px]" style={{ color: txId === c.id ? 'var(--accent)' : 'var(--ink-softer)' }}>{txId === c.id ? '✓' : '○'}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px]" style={{ color: 'var(--ink)' }}>{c.name}</span>
                        <span className="text-[11px]" style={{ color: 'var(--ink-softer)' }}>{fmtDia(c.date)}</span>
                      </span>
                    </span>
                    <span className="gd-mono shrink-0 text-[13px]" style={{ color: 'var(--ink-2)' }}><Money cents={c.amount} /></span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          {err && <span className="text-xs font-medium text-red-600">{err}</span>}
          <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={isPending}
            className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? 'Salvando…' : 'Marcar paga'}
          </button>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm hover:bg-black/[0.05]" style={{ color: 'var(--ink-soft)' }}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
