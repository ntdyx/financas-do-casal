'use client'

import { P1, P2, SPLIT_LABEL } from '@/lib/casal'
import { useState, useTransition } from 'react'
import { editRule } from '../actions'
import { ForgetButton } from './forget-button'

const SPLIT_SHORT: Record<string, { label: string; color: string }> = {
  '100': { label: `100% ${P1.short}`, color: 'var(--na)' },
  '50':  { label: '50/50', color: 'var(--ink-2)' },
  '25':  { label: `75% ${P2.short}`, color: 'var(--je)' },
  '0':   { label: `100% ${P2.short}`, color: 'var(--je)' },
}
function splitMeta(s: number | null): { label: string; color: string } {
  if (s === null) return { label: 'sem divisão', color: 'var(--ink-soft)' }
  return SPLIT_SHORT[String(s)] ?? { label: `${s}%`, color: 'var(--ink-soft)' }
}

// Pílula da divisão aprendida (regra fixa) — cores por tipo, conforme o handoff.
// 50/50 → warn; 100% pessoa 1 → na; 100% pessoa 2 (0% meu) → je.
const SPLIT_PILL: Record<string, { label: string; bg: string; color: string }> = {
  '100': { label: `100% ${P1.short}`,  bg: 'var(--na-soft)',   color: 'var(--na)' },
  '50':  { label: '50% / 50%', bg: 'var(--warn-soft)', color: 'var(--warn)' },
  '25':  { label: `75% ${P2.short}`,   bg: 'var(--je-soft)',   color: 'var(--je)' },
  '0':   { label: `100% ${P2.short}`,  bg: 'var(--je-soft)',   color: 'var(--je)' },
}
function splitPill(s: number | null): { label: string; bg: string; color: string } {
  if (s === null) return { label: 'sem divisão', bg: 'var(--surface-2)', color: 'var(--ink-soft)' }
  return SPLIT_PILL[String(s)] ?? { label: `${s}%`, bg: 'var(--surface-2)', color: 'var(--ink-soft)' }
}

interface Cat { id: string; name: string; emoji: string; color: string }

export interface SplitCount { split: number | null; count: number }

export interface Learning {
  pattern: string
  cat: { name: string; emoji: string; color: string } | null
  categoryId: string | null
  fixed: boolean
  /** Regra "não é um gasto" (⇄) aprendida — marca os iguais como transferência. */
  transfer?: boolean
  splitBreakdown: SplitCount[]
  /** Regra de divisão aprendida. undefined = sem regra (divisão é por gasto). */
  splitRule?: number | null
}

const inputCls = 'rounded-lg border bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
const inputStyle = { borderColor: 'var(--line-strong)', color: 'var(--ink)' } as const

// valor inicial do select de divisão: 'keep' = sem regra (por gasto)
function splitToValue(s: number | null | undefined): string {
  if (s === undefined) return 'keep'
  if (s === null) return 'none'
  return String(s)
}

export function LearningRow({ rule, categories }: { rule: Learning; categories: Cat[] }) {
  const [editing, setEditing] = useState(false)
  const [categoryId, setCategoryId] = useState<string>(rule.categoryId ?? '')
  const [fixed, setFixed] = useState<boolean>(rule.fixed)
  const [transfer, setTransfer] = useState<boolean>(rule.transfer ?? false)
  const [split, setSplit] = useState<string>(splitToValue(rule.splitRule))
  const [isPending, start] = useTransition()

  function save() {
    const splitData: number | null | 'keep' =
      split === 'keep' ? 'keep' : split === 'none' ? null : parseInt(split, 10)
    start(async () => {
      await editRule(rule.pattern, { categoryId: categoryId || null, fixed, split: splitData, transfer })
      setEditing(false)
    })
  }

  function cancel() {
    setCategoryId(rule.categoryId ?? '')
    setFixed(rule.fixed)
    setTransfer(rule.transfer ?? false)
    setSplit(splitToValue(rule.splitRule))
    setEditing(false)
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: '16px 18px',
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 16 }}>
        <span
          className="min-w-0 flex-1 truncate"
          style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}
        >
          {rule.pattern}
        </span>
        <div className="flex shrink-0 items-center" style={{ gap: 14 }}>
          {rule.cat && (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${rule.cat.color}1f`, color: rule.cat.color }}>
              {rule.cat.emoji} {rule.cat.name}
            </span>
          )}
          {rule.splitRule !== undefined && (() => {
            const p = splitPill(rule.splitRule ?? null)
            return (
              <span style={{ background: p.bg, color: p.color, borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 700 }}>
                {p.label}
              </span>
            )
          })()}
          {rule.fixed && (
            <span className="rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              📌 fixo
            </span>
          )}
          {rule.transfer && (
            <span className="rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)' }}>
              ⇄ não é gasto
            </span>
          )}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              title="Editar categoria, divisão e fixo"
              className="rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-black/[0.04]"
              style={{ color: 'var(--ink-softer)' }}
            >
              Editar
            </button>
          )}
          <ForgetButton pattern={rule.pattern} />
        </div>
      </div>

      {rule.splitBreakdown.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px]" style={{ color: 'var(--ink-softer)' }}>de quem cobrou</span>
          {rule.splitBreakdown.map((b) => {
            const m = splitMeta(b.split)
            return (
              <span key={String(b.split)} className="rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${m.color}1f`, color: m.color }}>
                {b.count}× {m.label}
              </span>
            )
          })}
        </div>
      )}

      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
          <select value={split} onChange={(e) => setSplit(e.target.value)} className={inputCls} style={inputStyle} title="Regra de divisão">
            <option value="keep">divisão: por gasto</option>
            <option value="none">sem divisão (fixa)</option>
            <option value="100">{SPLIT_LABEL["100"]}</option>
            <option value="50">50 / 50</option>
            <option value="25">{SPLIT_LABEL["25"]}</option>
            <option value="0">{SPLIT_LABEL["0"]}</option>
          </select>
          <button
            type="button"
            onClick={() => setFixed((f) => !f)}
            title={fixed ? 'Gasto fixo (recorrente) — clique pra desmarcar' : 'Marcar como gasto fixo'}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={fixed
              ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
              : { background: 'var(--line)', color: 'var(--ink-soft)' }}
          >
            📌 {fixed ? 'fixo' : 'não fixo'}
          </button>
          <button
            type="button"
            onClick={() => setTransfer((t) => !t)}
            title={transfer ? 'Não é um gasto (transferência/fatura) — clique pra voltar a ser gasto' : 'Marcar como não-gasto (⇄)'}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={transfer
              ? { background: 'var(--surface-2)', color: 'var(--ink)' }
              : { background: 'var(--line)', color: 'var(--ink-soft)' }}
          >
            ⇄ {transfer ? 'não é gasto' : 'é gasto'}
          </button>
          <span className="text-[11px]" style={{ color: 'var(--ink-softer)' }}>aplica a todos com esse nome</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={cancel} disabled={isPending} className="px-1 text-xs font-medium disabled:opacity-50" style={{ color: 'var(--ink-soft)' }}>
              cancelar
            </button>
            <button type="button" onClick={save} disabled={isPending} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--positive)' }}>
              {isPending ? 'salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
