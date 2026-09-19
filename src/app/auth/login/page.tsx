'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogoMark } from '@/components/logo'

export default function LoginPage() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const supabase = createClient()

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    setLoading(false)

    if (error) {
      setError(traduzErro(error.message))
      return
    }

    setStep('code')
    setInfo(`Enviamos um código para ${email}`)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })

    if (error) {
      setLoading(false)
      setError(traduzErro(error.message))
      return
    }

    // Sessão gravada nos cookies — navegação completa pro dashboard
    window.location.href = '/dashboard'
  }

  const inputCls =
    'w-full rounded-xl px-4 text-[15px] outline-none transition-colors focus:ring-2'
  const inputStyle = {
    minHeight: 48,
    background: 'var(--nav-card)',
    border: '1px solid var(--nav-line)',
    color: 'var(--nav-ink)',
    '--tw-ring-color': 'var(--accent)',
  } as React.CSSProperties

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'var(--nav-bg)' }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span style={{ color: 'var(--lime)' }}>
            <LogoMark size={72} />
          </span>
          <h1
            className="gd-display mt-4 text-[30px]"
            style={{ color: 'var(--nav-ink)' }}
          >
            Gastadeiras
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--nav-ink-2)' }}>
            {step === 'email'
              ? 'Digite seu e-mail para entrar'
              : 'Digite o código que chegou no seu e-mail'}
          </p>
        </div>

        {error && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}
          >
            {error}
          </div>
        )}
        {info && !error && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            {info}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm" style={{ color: 'var(--nav-ink-2)' }}>
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl text-sm font-semibold text-white transition-[filter] hover:brightness-[1.06] disabled:opacity-50"
              style={{ minHeight: 48, background: 'var(--accent)' }}
            >
              {loading ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-sm" style={{ color: 'var(--nav-ink-2)' }}>
                Código
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className={`${inputCls} text-center text-xl tracking-[0.4em]`}
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl text-sm font-semibold text-white transition-[filter] hover:brightness-[1.06] disabled:opacity-50"
              style={{ minHeight: 48, background: 'var(--accent)' }}
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={sendCode}
                disabled={loading}
                className="rounded-lg px-1 py-2 transition-colors disabled:opacity-50"
                style={{ color: 'var(--nav-ink-2)' }}
              >
                Reenviar código
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setError(null)
                  setInfo(null)
                }}
                className="rounded-lg px-1 py-2 transition-colors"
                style={{ color: 'var(--nav-ink-2)' }}
              >
                ← Trocar e-mail
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}

function traduzErro(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('only request this after') || m.includes('rate limit') || m.includes('security purposes')) {
    return 'Aguarde alguns segundos antes de pedir um novo código.'
  }
  if (m.includes('invalid') || m.includes('expired') || m.includes('token')) {
    return 'Código inválido ou expirado. Confira ou reenvie um novo.'
  }
  return msg
}
