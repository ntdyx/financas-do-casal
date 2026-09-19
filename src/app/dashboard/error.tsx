'use client' // error boundary precisa ser Client Component

import { useEffect } from 'react'

/**
 * Rede de segurança do dashboard.
 *
 * Várias server actions sinalizam erro com `throw` ("Escolha a divisão antes de
 * revisar", "Transação não encontrada"), e os botões chamam essas actions dentro
 * de `startTransition` sem try/catch. Sem um error.tsx neste segmento a exceção
 * subia até o boundary padrão do Next e a tela toda era substituída — em
 * produção, por uma mensagem genérica com um digest. Aqui pelo menos ela lê o
 * motivo e continua no app.
 *
 * Em Next 16 a prop de recuperação é `retry()` (refaz o fetch e re-renderiza o
 * segmento); `reset()` existe mas só limpa o estado sem buscar de novo.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[dashboard]', error)
  }, [error])

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-4xl">😕</p>
      <h2 className="gd-display mt-4 text-2xl" style={{ color: 'var(--ink)' }}>
        Essa ação não deu certo
      </h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
        {error.message || 'Algo quebrou aqui. Nada foi salvo.'}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => retry()}
          className="rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--paper)' }}
        >
          Tentar de novo
        </button>
        <a
          href="/dashboard"
          className="rounded-xl px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          Voltar pro início
        </a>
      </div>
      {error.digest && (
        <p className="mt-6 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          código: {error.digest}
        </p>
      )}
    </div>
  )
}
