'use client'

import { useState, useTransition } from 'react'
import { setFixedBillDueDay } from '../actions'

interface Props {
  id: string
  name: string
  emoji: string
  dueDay: number | null
  /** Dia em que ela costuma ser PAGA (mediana do histórico) — só palpite. */
  diaAprendido: number | null
}

/**
 * Uma linha do "quando vence cada conta". O palpite do histórico entra como
 * sugestão clicável, nunca como valor salvo: ele é o dia em que o casal PAGOU,
 * que pode ser justamente o dia atrasado.
 */
export function VencimentoRow({ id, name, emoji, dueDay, diaAprendido }: Props) {
  const [valor, setValor] = useState(dueDay ? String(dueDay) : '')
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const salvar = (raw: string) => {
    const limpo = raw.trim()
    const dia = limpo === '' ? null : Number(limpo)
    if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) {
      setErro('de 1 a 31')
      return
    }
    if (dia === dueDay) return
    setErro(null)
    startTransition(async () => {
      try {
        await setFixedBillDueDay(id, dia)
        setSalvo(true)
        setTimeout(() => setSalvo(false), 2000)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'não salvou')
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t py-2.5" style={{ borderColor: 'var(--line)' }}>
      <span className="flex min-w-0 items-center gap-2 text-[13.5px]" style={{ color: 'var(--ink)' }}>
        <span className="shrink-0">{emoji}</span>
        <span className="truncate font-semibold">{name}</span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {!dueDay && diaAprendido && (
          <button
            type="button"
            onClick={() => { setValor(String(diaAprendido)); salvar(String(diaAprendido)) }}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
          >
            usar dia {diaAprendido}
          </button>
        )}
        {erro && <span className="text-[11px]" style={{ color: 'var(--negative)' }}>{erro}</span>}
        {salvo && <span className="text-[11px]" style={{ color: 'var(--positive)' }}>salvo ✓</span>}
        <span className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>dia</span>
        <input
          type="number"
          min={1}
          max={31}
          inputMode="numeric"
          value={valor}
          disabled={pending}
          placeholder="—"
          onChange={(e) => setValor(e.target.value)}
          onBlur={(e) => salvar(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-[58px] rounded-[9px] px-2 py-1.5 text-center text-[13.5px] font-semibold outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          aria-label={`Dia do vencimento de ${name}`}
        />
      </span>
    </div>
  )
}
