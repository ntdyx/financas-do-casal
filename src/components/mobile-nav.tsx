'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV, NavIcon, isNavActive } from '@/components/sidebar'

/**
 * Barra de navegação inferior — só no mobile (lg:hidden). Espelha o menu
 * lateral do desktop, que fica escondido abaixo de lg. Cada alvo tem
 * min-height 56px pra dar folga ao toque.
 */
export function MobileNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex lg:hidden"
      style={{
        background: 'var(--nav-bg)',
        borderTop: '1px solid var(--nav-line)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Navegação principal"
    >
      {NAV.map((item) => {
        const active = isNavActive(item, pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2"
            style={{ minHeight: 56, color: active ? '#fff' : 'var(--nav-ink-2)' }}
          >
            <span className="relative flex items-center justify-center">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-[10px]"
                style={{ background: active ? 'var(--accent)' : 'transparent' }}
              >
                <NavIcon name={item.icon} />
              </span>
              {item.badge && pendingCount > 0 && (
                <span
                  className="absolute -right-1 -top-0.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-bold leading-[16px] gd-mono"
                  style={{ background: 'var(--lime)', color: 'var(--lime-ink)' }}
                >
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </span>
            <span className="text-[10.5px] font-semibold tracking-[-0.01em]">
              {item.short ?? item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
