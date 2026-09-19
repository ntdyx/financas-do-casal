export function CardSkeleton() {
  return (
    <div
      className="rounded-[16px] border h-[92px] animate-pulse"
      style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
    />
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[28px_1fr_80px] items-center gap-3 py-3 animate-pulse"
          style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
        >
          <div className="h-7 w-7 rounded-full" style={{ background: 'var(--line)' }} />
          <div className="h-3 rounded" style={{ background: 'var(--line)' }} />
          <div className="h-3 rounded" style={{ background: 'var(--line)' }} />
        </div>
      ))}
    </div>
  )
}
