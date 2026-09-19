'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSpendCap } from '../actions'
import { Money } from '@/components/money'
import type { TetoFuturo } from './mes-card'

/** Editor do teto do mes. Fechado por padrao — so abre quando clicam. */
export function TetoForm({ mes, atual, futuro }: { mes: string; atual: number | null; futuro: TetoFuturo | null }) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // O `revalidatePath` do server action nao refaz esta tela sozinho: quem chama
  // a action e este callback do cliente, nao o `action` do form. Sem o refresh,
  // salvar o teto fechava o formulario e o card continuava dizendo "sem teto" —
  // parecia que nao tinha salvo. Agora o teto E o numero principal do card, e
  // ver o numero mudar na hora e a unica confirmacao que existe.
  const router = useRouter()

  if (!aberto) {
    return (
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-[12px] font-semibold underline"
          style={{ color: 'var(--ink-softer)' }}
        >
          {atual == null ? 'definir teto' : 'mudar teto'}
        </button>
        {futuro && (
          <span className="text-[12px]" style={{ color: 'var(--ink-softer)' }}>
            <Money cents={futuro.valor} /> a partir de {futuro.mes}
          </span>
        )}
      </div>
    )
  }

  return (
    <form
      action={async (fd) => {
        const r = await setSpendCap(fd)
        if (r.error) setErro(r.error)
        else { setErro(null); setAberto(false); router.refresh() }
      }}
      className="mt-2 flex flex-wrap items-center gap-1.5"
    >
      {/* O teto e do mes que esta na tela, nao do mes de hoje. */}
      <input type="hidden" name="mes" value={mes} />
      <input
        name="valor"
        type="text"
        inputMode="decimal"
        placeholder="50000"
        defaultValue={atual != null ? String(atual / 100) : ''}
        className="w-24 rounded-lg px-2 py-1 text-[13px]"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink)' }}
      />
      <button type="submit" className="rounded-lg px-2.5 py-1 text-[13px] font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
        salvar
      </button>
      <button type="button" onClick={() => { setAberto(false); setErro(null) }} className="text-[12px]" style={{ color: 'var(--ink-softer)' }}>
        cancelar
      </button>
      <p className="w-full text-[11px]" style={{ color: 'var(--ink-softer)' }}>
        tudo que sai no mês: recorrente + rotina. Compra única grande fica de fora.
      </p>
      {erro && <span className="text-[12px]" style={{ color: 'var(--negative)' }}>{erro}</span>}
    </form>
  )
}
