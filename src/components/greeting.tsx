'use client'

import { P1, P2 } from '@/lib/casal'
import { useEffect, useState } from 'react'

function saudacaoDe(hour: number) {
  return hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite'
}

export function Greeting({ initialHour }: { initialHour: number }) {
  // Começa com o horário do servidor (SSR) e reajusta pelo fuso do navegador da pessoa.
  const [saudacao, setSaudacao] = useState(() => saudacaoDe(initialHour))

  useEffect(() => {
    setSaudacao(saudacaoDe(new Date().getHours()))
  }, [])

  return (
    <div
      className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-[16px]"
      style={{ color: 'var(--ink-2)' }}
      suppressHydrationWarning
    >
      {saudacao}, <b style={{ color: 'var(--accent)', fontWeight: 700 }}>{P1.name} e {P2.name}</b> 👋
    </div>
  )
}
