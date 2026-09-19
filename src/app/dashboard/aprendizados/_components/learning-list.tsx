'use client'

import { useState, useMemo } from 'react'
import { LearningRow, type Learning } from './learning-row'

interface Cat { id: string; name: string; emoji: string; color: string }

export function LearningList({ rules, categories }: { rules: Learning[]; categories: Cat[] }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rules
    return rules.filter((r) =>
      r.pattern.toLowerCase().includes(term) || (r.cat?.name.toLowerCase().includes(term) ?? false),
    )
  }, [q, rules])

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-[38px] flex-1 items-center gap-2 rounded-xl border px-3" style={{ background: 'var(--surface)', borderColor: q ? 'var(--accent)' : 'var(--line-strong)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={q ? 'var(--accent)' : 'var(--ink-soft)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empresa ou categoria…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Limpar busca" style={{ color: 'var(--ink-soft)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <span className="shrink-0" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
          {filtered.length} {filtered.length === 1 ? 'aprendizado' : 'aprendizados'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="gd-empty">
          <p>Nenhum aprendizado com “{q}”.</p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {filtered.map((r) => (
            <LearningRow key={r.pattern} rule={r} categories={categories} />
          ))}
        </div>
      )}
    </>
  )
}
