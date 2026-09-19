'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

// react-pluggy-connect acessa `window` no nível do módulo — precisa de ssr: false
const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((m) => m.PluggyConnect),
  { ssr: false },
)

export function ConnectButton({ variant = 'primary' }: { variant?: 'primary' | 'dashed' }) {
  const router = useRouter()
  const [connectToken, setConnectToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  async function openWidget() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pluggy/connect-token')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setConnectToken(body.accessToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      console.error('[connect-token]', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSuccess = useCallback(async ({ item }: { item: { id: string } }) => {
    setConnectToken(null)
    setSyncing(true)
    setError('')
    console.log('[pluggy] onSuccess itemId:', item.id)
    try {
      const res = await fetch('/api/pluggy/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      })
      const body = await res.json()
      console.log('[pluggy] sync response:', res.status, body)
      if (!res.ok) throw new Error(body.error ?? 'Erro ao sincronizar dados')
      setError(`✓ Sync ok — ${body.synced?.accounts ?? 0} conta(s), ${body.synced?.transactions ?? 0} transação(ões)`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao sincronizar')
      console.error('[pluggy] sync error:', e)
    } finally {
      setSyncing(false)
    }
  }, [router])

  const handleClose = useCallback(() => setConnectToken(null), [])

  const handleError = useCallback(({ message }: { message: string }) => {
    setConnectToken(null)
    setError(`Erro na conexão: ${message}`)
  }, [])

  const isDashed = variant === 'dashed'
  const busy = loading || syncing

  return (
    <div className={isDashed ? 'flex flex-col gap-2' : 'flex flex-col items-end gap-2'}>
      {isDashed ? (
        <button
          onClick={openWidget}
          disabled={busy}
          className="flex items-center justify-center gap-2.5 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            border: '1.5px dashed var(--line)',
            borderRadius: 16,
            padding: 20,
            color: 'var(--ink-2)',
            width: '100%',
          }}
        >
          {busy ? (
            <>
              <Spinner /> {loading ? 'Carregando…' : 'Sincronizando…'}
            </>
          ) : (
            <>
              <span style={{ fontSize: 20, fontWeight: 300, lineHeight: 1 }}>＋</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Conectar conta</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={openWidget}
          disabled={busy}
          className="flex items-center gap-2 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: 'var(--ink)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: 12,
            padding: '11px 18px',
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? (
            <>
              <Spinner /> Carregando…
            </>
          ) : syncing ? (
            <>
              <Spinner /> Sincronizando…
            </>
          ) : (
            <>
              <span className="text-base leading-none">＋</span>
              Conectar conta
            </>
          )}
        </button>
      )}

      {error && (
        <p className="text-xs" style={{ color: error.startsWith('✓') ? 'var(--positive)' : 'var(--negative)' }}>{error}</p>
      )}

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={process.env.NODE_ENV !== 'production'}
          language="pt"
          onSuccess={handleSuccess}
          onClose={handleClose}
          onError={handleError}
        />
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}
