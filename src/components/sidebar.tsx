'use client'

import { P1, P2 } from '@/lib/casal'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/logo'
import { PersonFace } from '@/components/person-face'

export type NavItem = {
  href: string
  label: string
  icon: string
  short?: string
  exact?: boolean
  badge?: boolean
  match?: string[]
}

export const NAV: NavItem[] = [
  { href: '/dashboard',              label: 'Início',        short: 'Início',  icon: 'inicio',       exact: true },
  { href: '/dashboard/transacoes',   label: 'Movimentações', short: 'Gastos',  icon: 'gastos',       match: ['/dashboard/transacoes', '/dashboard/entradas', '/dashboard/investimentos'] },
  { href: '/dashboard/pendentes',    label: 'Pendentes',     short: 'Revisar', icon: 'pendentes',    badge: true },
  { href: '/dashboard/aprendizados', label: 'Aprendizados',  short: 'Aprend.', icon: 'aprendizados', match: ['/dashboard/aprendizados', '/dashboard/historico'] },
  { href: '/dashboard/fechamento',   label: 'Fechamento',    short: 'Fechar',  icon: 'fechamento' },
  { href: '/dashboard/previsao',     label: 'Previsão',      short: 'Prever',  icon: 'fechamento' },
  { href: '/dashboard/laudo',        label: 'Laudo',         short: 'Laudo',   icon: 'laudo' },
  { href: '/dashboard/contas',       label: 'Configurações', short: 'Config',  icon: 'config',       match: ['/dashboard/contas', '/dashboard/categorias'] },
]

export function isNavActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : (item.match ?? [item.href]).some((m) => pathname === m || pathname.startsWith(m + '/'))
}

export function NavIcon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const map: Record<string, React.ReactNode> = {
    inicio:       <svg {...common}><path d="M4 10.5 12 4l8 6.5M6 9.5V20h4v-6h4v6h4V9.5" /></svg>,
    gastos:       <svg {...common}><path d="M5 9h12l-3-3M19 15H7l3 3" /></svg>,
    entradas:     <svg {...common}><path d="M12 20V5M6 11l6-6 6 6" /></svg>,
    investimentos: <svg {...common}><path d="M4 4v16h16" /><path d="M8 14l3-4 3 2 5-7" /><path d="M18 5h3v3" /></svg>,
    pendentes:    <svg {...common}><path d="M4 14h4l1.5 2.5h5L20 14M4 14 6.5 5h11L20 14v5H4z" /></svg>,
    aprendizados: <svg {...common}><path d="M12 4c2.5 3.5 4.5 6 4.5 8.5a4.5 4.5 0 0 1-9 0C7.5 10 9.5 7.5 12 4z" /></svg>,
    fechamento:   <svg {...common}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v3M16 3v3M8.5 14l2.2 2.2 4.3-4.4" /></svg>,
    categorias:   <svg {...common}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.2" /></svg>,
    historico:    <svg {...common}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l3 2" /></svg>,
    contas:       <svg {...common}><path d="M3 7.5h18v9H3zM3 11h18" /></svg>,
    laudo:        <svg {...common}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9.5 17v-3M12 17v-6M14.5 17v-4" /></svg>,
    config:       <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  }
  return map[name] ?? null
}

export function Sidebar({ pendingCount = 0 }: { member?: { name: string; photo: string | null; initial: string }; pendingCount?: number }) {
  const pathname = usePathname()

  return (
    <aside
      className="hidden w-[248px] shrink-0 flex-col px-4 pb-[18px] pt-6 lg:flex"
      style={{ background: 'var(--nav-bg)' }}
    >
      <div className="flex items-center px-2 pb-[26px] pt-1">
        <Logo size={26} />
      </div>

      <nav className="flex flex-col gap-[3px]">
        {NAV.map((item) => {
          const { href, label, icon, badge } = item
          const active = isNavActive(item, pathname)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-[11px] py-[10px] transition-colors"
              style={{ background: active ? 'var(--nav-card)' : 'transparent' }}
            >
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--nav-ink-2)',
                }}
              >
                <NavIcon name={icon} />
              </span>
              <span
                className="flex-1 text-[14.5px] tracking-[-0.01em]"
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? '#fff' : 'var(--nav-ink-2)',
                }}
              >
                {label}
              </span>
              {badge && pendingCount > 0 && (
                <span
                  className="ml-auto rounded-full px-[9px] py-0.5 text-[11.5px] font-bold gd-mono"
                  style={{ background: 'var(--lime)', color: 'var(--lime-ink)' }}
                >
                  {pendingCount > 999 ? '999+' : pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {/* Card "pra revisar" */}
        {pendingCount > 0 && (
          <div
            className="rounded-2xl px-4 py-[15px]"
            style={{ background: 'var(--nav-card)', border: '1px solid var(--nav-line)' }}
          >
            <div className="text-[12px] font-medium" style={{ color: 'var(--nav-ink-2)' }}>
              pra revisar
            </div>
            <div className="mt-0.5 gd-mono text-[30px] font-extrabold tracking-[-0.02em] text-white">
              {pendingCount > 999 ? '999+' : pendingCount}
            </div>
            <Link
              href="/dashboard/pendentes"
              className="mt-[13px] flex items-center justify-between gap-2 rounded-[10px] px-[13px] py-[9px] text-[13px] font-bold transition-[filter] hover:brightness-[0.97]"
              style={{ background: 'var(--lime)', color: 'var(--lime-ink)' }}
            >
              revisar agora
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        )}

        {/* Rodapé N & J */}
        <div
          className="flex items-center gap-[11px] px-2 pb-1 pt-3"
          style={{ borderTop: '1px solid var(--nav-line)' }}
        >
          <div className="relative h-[30px] w-[34px] shrink-0">
            <span
              className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ background: '#3A3B46', border: '2px solid var(--nav-bg)' }}
            >
              <PersonFace who="nat" />
            </span>
            <span
              className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ background: 'var(--accent)', border: '2px solid var(--nav-bg)' }}
            >
              <PersonFace who="jen" />
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-[1.25]">
            <span className="truncate text-[13px] font-semibold text-white">
              {P1.name} &amp; {P2.name}
            </span>
            <span className="text-[11.5px]" style={{ color: 'var(--nav-ink-2)' }}>
              plano dupla
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
