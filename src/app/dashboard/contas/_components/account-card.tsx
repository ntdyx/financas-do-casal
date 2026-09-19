'use client'

import { P1, P2 } from '@/lib/casal'
import { useTransition, useState, type ReactNode } from 'react'
import { deleteAccount } from '../actions'
import { Money } from '@/components/money'
import { AccountSettings } from './account-settings'
import { PersonFace, type Who } from '@/components/person-face'

type Owner = 'me' | 'pessoa2' | 'shared'

interface Props {
  account: {
    id: string
    name: string
    type: 'checking' | 'credit'
    owner: Owner
    default_split_mine_pct: number | null
    balance_cents: number | null
    balance_due_date: string | null
    last_synced_at: string | null
    created_at: string
    pluggy_item_id: string | null
  }
  stats: {
    txCount: number
    monthSpent: number
    monthReceived: number
    pixSpent: number
  }
}

// Cores atreladas ao membro real (--na/--je), igual ao Histórico.
const OWNER_THEME: Record<Owner, { color: string; initial: string; who: Who | null }> = {
  me:      { color: 'var(--na)',   initial: P1.initial, who: 'nat' },
  shared:  { color: 'var(--warn)', initial: '½', who: null },
  pessoa2: { color: 'var(--je)',   initial: P2.initial, who: 'jen' },
}

// Marca da instituição a partir do nome — mesmo mapa usado na tag de Transações.
function detectBank(name: string): { abbr: string; bg: string; fg: string } {
  const n = name.toLowerCase()
  if (n.includes('nubank'))                                return { abbr: 'Nu', bg: '#820AD1', fg: '#fff' }
  if (n.includes('xp'))                                    return { abbr: 'XP', bg: '#15140F', fg: '#fff' }
  if (n.includes('infinitepay') || n.includes('infinite')) return { abbr: 'IP', bg: '#00B37E', fg: '#fff' }
  if (n.includes('itaú') || n.includes('itau'))            return { abbr: 'It', bg: '#EC7000', fg: '#fff' }
  if (n.includes('bradesco'))                              return { abbr: 'Br', bg: '#CC092F', fg: '#fff' }
  if (n.includes('inter'))                                 return { abbr: 'In', bg: '#FF7A00', fg: '#fff' }
  if (n.includes('santander'))                             return { abbr: 'Sa', bg: '#CC0000', fg: '#fff' }
  if (n.includes('caixa'))                                 return { abbr: 'Ca', bg: '#005CA9', fg: '#fff' }
  if (n.includes('brasil') || n.includes(' bb'))           return { abbr: 'BB', bg: '#FBBA00', fg: '#000' }
  if (n.includes('c6'))                                    return { abbr: 'C6', bg: '#242424', fg: '#F5E642' }
  if (n.includes('pagseguro') || n.includes('pagbank'))    return { abbr: 'PB', bg: '#009B3A', fg: '#fff' }
  if (n.includes('sicoob'))                                return { abbr: 'Si', bg: '#005236', fg: '#fff' }
  if (n.includes('sicredi'))                               return { abbr: 'Sc', bg: '#00783E', fg: '#fff' }
  return { abbr: name.slice(0, 2).toUpperCase(), bg: 'var(--ink)', fg: '#fff' }
}

export function AccountCard({ account, stats }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [open, setOpen] = useState(false)
  const theme = OWNER_THEME[account.owner] ?? OWNER_THEME.me
  const bank = detectBank(account.name)
  const isCredit = account.type === 'credit'
  const subtitle = `${isCredit ? 'Cartão de crédito' : 'Conta corrente'} · PF`

  async function handleSync() {
    if (!account.pluggy_item_id) return
    setIsSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/pluggy/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: account.pluggy_item_id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro')
      setSyncMsg(`✓ ${body.synced?.transactions ?? 0} transações`)
      window.location.reload()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erro ao sincronizar')
    } finally {
      setIsSyncing(false)
    }
  }

  const dueDate = account.balance_due_date
    ? new Date(account.balance_due_date + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short',
      })
    : null

  const lastSync = account.last_synced_at
    ? new Date(account.last_synced_at).toLocaleString('pt-BR', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'Nunca'

  function handleDelete() {
    if (!confirm(`Remover "${account.name}"? As transações vinculadas também serão apagadas.`)) return
    startTransition(() => deleteAccount(account.id))
  }

  return (
    <div
      className={`transition-opacity ${isPending ? 'pointer-events-none opacity-40' : ''}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
      }}
    >
      {/* Linha principal da conta */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Logo da instituição */}
        <span
          className="grid flex-none place-items-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: bank.bg,
            color: bank.fg,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          {bank.abbr}
        </span>

        {/* Nome + subtítulo */}
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            {account.name}
          </div>
          <div className="truncate" style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>
            {subtitle}
          </div>
        </div>

        {/* Avatar do responsável */}
        <span
          className="grid flex-none place-items-center text-white"
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: theme.color,
            fontSize: 11,
            fontWeight: 700,
          }}
          title="Responsável"
        >
          {theme.who ? <PersonFace who={theme.who} /> : theme.initial}
        </span>

        {/* Badge de status */}
        <span
          className="flex-none"
          style={{
            background: 'var(--lime-soft)',
            color: 'var(--lime-ink)',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ● conectada
        </span>

        {/* Sincronizar (mantém ação existente) */}
        {account.pluggy_item_id && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="grid flex-none place-items-center transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              color: 'var(--ink-2)',
            }}
            title="Sincronizar agora"
          >
            <SyncIcon spinning={isSyncing} />
          </button>
        )}

        {/* Configurar (expande as configurações existentes) */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-none transition-opacity hover:opacity-80"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '7px 13px',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          configurar
        </button>
      </div>

      {/* Painel expandido: hero de saldo/fatura, stats, settings e remover */}
      {open && (
        <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: 'var(--line)' }}>
          {/* Saldo / Fatura — herói */}
          <div className="mb-4">
            {isCredit ? (
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Fatura aberta</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                    {account.balance_cents != null ? <Money cents={account.balance_cents} /> : '—'}
                  </p>
                </div>
                {dueDate && (
                  <div className="pb-0.5 text-right">
                    <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>vence</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{dueDate}</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Saldo atual</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--positive)' }}>
                  {account.balance_cents != null ? <Money cents={account.balance_cents} /> : '—'}
                </p>
              </div>
            )}
          </div>

          <AccountSettings
            accountId={account.id}
            currentOwner={account.owner}
            currentSplitMinePct={account.default_split_mine_pct}
          />

          {syncMsg && (
            <p className="mt-2 text-xs" style={{ color: syncMsg.startsWith('✓') ? 'var(--positive)' : 'var(--negative)' }}>
              {syncMsg}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Gastos no mês" value={<Money cents={Math.abs(stats.monthSpent)} />} color="var(--negative)" />
            <Stat label="Entradas" value={<Money cents={stats.monthReceived} />} color="var(--positive)" />
            {isCredit ? (
              <Stat label="Transações" value={String(stats.txCount)} color="var(--ink-2)" />
            ) : (
              <Stat
                label="Pix no mês"
                value={stats.pixSpent !== 0 ? <Money cents={Math.abs(stats.pixSpent)} /> : '—'}
                color="var(--accent)"
              />
            )}
            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>Último sync</p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--ink-soft)' }}>{lastSync}</p>
            </div>
          </div>

          <button
            onClick={handleDelete}
            disabled={isPending}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{ color: 'var(--negative)' }}
          >
            <TrashIcon /> Remover conta
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
      <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color }}>{value}</p>
    </div>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? 'animate-spin' : ''}
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}
