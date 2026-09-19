import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { PrivacyToggle } from '@/components/privacy-toggle'
import { Suspense } from 'react'
import { Greeting } from '@/components/greeting'
import { HeaderMonth } from '@/components/header-month'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { count: pendingCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('reviewed', false)
    .eq('is_transfer', false)
    .lt('amount_cents', 0)

  const hour = new Date().getHours()

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Aplica o modo privado antes da pintura, evitando flash dos valores */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.dataset.privacy=localStorage.getItem('gd-privacy')==='on'?'on':'off'}catch(e){}`,
        }}
      />
      <Sidebar member={user.actor} pendingCount={pendingCount ?? 0} />

      <main className="flex-1 flex flex-col min-w-0">
        <header
          className="flex h-[62px] items-center justify-between gap-3 border-b px-5 shrink-0 lg:px-10"
          style={{ borderColor: 'var(--line)' }}
        >
          <Greeting initialHour={hour} />
          <div className="flex items-center gap-3">
            <Suspense fallback={<div className="hidden text-[12px] capitalize sm:block" style={{ color: 'var(--ink-soft)' }}>{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>}>
              <HeaderMonth initial={new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} />
            </Suspense>
            <PrivacyToggle />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-9 pb-28 lg:px-10 lg:pb-9">
          {children}
        </div>
      </main>

      <MobileNav pendingCount={pendingCount ?? 0} />
    </div>
  )
}
