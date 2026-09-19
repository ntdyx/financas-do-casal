/**
 * Marca Gastadeiras — carteira com coração dentro de um círculo.
 * Line-art em `currentColor` (some hard-coded color): o pai define a cor
 * (lime no fundo escuro do sidebar/login). Escala sem perder nitidez.
 */
export function LogoMark({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      role="img"
    >
      <circle cx="32" cy="32" r="27" />
      {/* aba dobrada da carteira */}
      <path d="M20 26 L40 18.8 a3.2 3.2 0 0 1 4.2 3 L44.2 26" />
      {/* corpo */}
      <rect x="16" y="26" width="32" height="20" rx="3.6" />
      {/* fecho / bolso lateral com botão */}
      <path d="M48 32 h3.4 a2.4 2.4 0 0 1 2.4 2.4 v3.2 a2.4 2.4 0 0 1 -2.4 2.4 H48" />
      <circle cx="49.6" cy="36" r="1.15" fill="currentColor" stroke="none" />
      {/* coração */}
      <path d="M25 41.4 c-4-3-6.2-5.4-6.2-8 a3.1 3.1 0 0 1 6.2-1.4 a3.1 3.1 0 0 1 6.2 1.4 c0 2.6-2.2 5-6.2 8 z" />
    </svg>
  )
}

/**
 * Lockup completo: marca + wordmark "Gastadeiras".
 * `tone` controla a cor da marca ('lime' padrão para fundos escuros).
 */
export function Logo({
  size = 26,
  markColor = 'var(--lime)',
  wordmarkColor = '#fff',
  className,
  gap = 9,
}: {
  size?: number
  markColor?: string
  wordmarkColor?: string
  className?: string
  gap?: number
}) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <span style={{ display: 'inline-flex', color: markColor }}>
        <LogoMark size={size} className="gd-logo" />
      </span>
      <span
        className="gd-display"
        style={{
          fontWeight: 800,
          letterSpacing: '-0.03em',
          fontSize: size * 0.82,
          color: wordmarkColor,
          lineHeight: 1,
        }}
      >
        Gastadeiras
      </span>
    </span>
  )
}
