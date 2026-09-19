import { P1, P2 } from '@/lib/casal'
import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/paginate'
import { Money } from '@/components/money'
import { prettyName } from '@/lib/merchants'
import {
  porMes, mediana, foraDaCurva, parcelasAbertas, cronogramaParcelas,
  ehRecorrente, nomeCurto, donoDe, porNatureza, NATUREZA_LABEL, NATUREZA_NOTA,
  type LaudoTx, type Dono,
} from '@/lib/laudo'

export const metadata = { title: 'Laudo · Gastadeiras' }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotulo = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`

const DONO_LABEL: Record<Dono, string> = { juntos: 'juntas', nat: P1.name, jen: P2.name, sem: 'sem divisão' }
const DONO_COR: Record<Dono, string> = {
  juntos: 'var(--ink-2)', nat: 'var(--na)', jen: 'var(--je)', sem: 'var(--ink-softer)',
}

/** Rótulo de seção — numerado porque o laudo se lê em ordem. */
function Secao({ n, titulo, sub, children }: { n: string; titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="flex items-baseline gap-2.5">
        <span className="gd-mono text-[11px] font-bold" style={{ color: 'var(--accent)' }}>{n}</span>
        <h2 className="gd-display text-[22px]" style={{ color: 'var(--ink)' }}>{titulo}</h2>
      </div>
      {sub && <p className="mt-1.5 text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Faixa de destaque — cor pela severidade, sem virar mais um card. */
function Faixa({ tom = 'neutro', titulo, children }: {
  tom?: 'neutro' | 'alerta' | 'bom'; titulo: string; children: React.ReactNode
}) {
  const cor = tom === 'alerta' ? 'var(--negative)' : tom === 'bom' ? 'var(--positive)' : 'var(--line-strong)'
  return (
    <div className="mb-3 border-l-2 py-2.5 pl-3.5 last:mb-0" style={{ borderColor: cor }}>
      <p className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>{titulo}</p>
      <div className="mt-1 text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{children}</div>
    </div>
  )
}

type Recorte = 'tudo' | 'juntos' | 'nat' | 'jen'
const RECORTES: { v: Recorte; label: string }[] = [
  { v: 'tudo', label: 'Tudo' },
  { v: 'juntos', label: 'Só o que é junto' },
  { v: 'nat', label: `Só ${P1.name}` },
  { v: 'jen', label: `Só ${P2.name}` },
]

/**
 * Chips do recorte. Aparecem também no estado vazio: filtrar e cair num recorte
 * sem gasto não pode deixar a pessoa presa, sem caminho de volta.
 */
function Chips({ recorte }: { recorte: Recorte }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {RECORTES.map((r) => (
        <Link key={r.v} href={r.v === 'tudo' ? '/dashboard/laudo' : `/dashboard/laudo?quem=${r.v}`}
              className={`gd-chip${r.v === recorte ? ' active' : ''}`}>
          {r.label}
        </Link>
      ))}
    </div>
  )
}

export default async function LaudoPage({ searchParams }: { searchParams: Promise<{ quem?: string }> }) {
  const sp = await searchParams
  const recorte = (RECORTES.find((r) => r.v === sp.quem)?.v ?? 'tudo') as Recorte
  const user = await getUser()
  const supabase = await createClient()
  const ano = new Date().getFullYear()
  const inicio = `${ano}-01-01`

  const linhas = await fetchAllPages<{
    transaction_date: string; description: string | null; note: string | null
    amount_cents: number; split_mine_pct: number | null; is_fixed: boolean | null
    fixed_bill_id: string | null; installment_number: number | null; total_installments: number | null
    categories: { name: string } | { name: string }[] | null
  }>((de, ate) =>
    supabase
      .from('transactions')
      .select('transaction_date, description, note, amount_cents, split_mine_pct, is_fixed, fixed_bill_id, installment_number, total_installments, categories(name)')
      .eq('user_id', user!.id)
      .lt('amount_cents', 0)
      .eq('is_transfer', false)
      .gte('transaction_date', inicio)
      .order('id', { ascending: true })
      .range(de, ate),
  )

  const todas: LaudoTx[] = linhas.map((r) => {
    const c = Array.isArray(r.categories) ? r.categories[0] : r.categories
    return { ...r, categoria: c?.name ?? 'Sem categoria' }
  })

  // O recorte vale pra TUDO que vem abaixo: mediana, naturezas, parcelas e
  // anomalias. "Junto" é o que tem divisão entre as duas (não 100% de ninguém).
  const txs = recorte === 'tudo' ? todas : todas.filter((t) => donoDe(t) === (recorte === 'juntos' ? 'juntos' : recorte))

  const meses = porMes(txs)
  const mesAtual = new Date().toISOString().slice(0, 7)
  const fechados = meses.filter((m) => m.mes < mesAtual)
  const medRec = mediana(fechados.map((m) => m.recorrente))
  const medRot = mediana(fechados.map((m) => m.rotina))
  const medTeto = mediana(fechados.map((m) => m.noTeto))

  const totalAno = txs.reduce((s, t) => s + Math.abs(t.amount_cents), 0)
  const porDonoAno = txs.reduce<Record<Dono, number>>(
    (acc, t) => { acc[donoDe(t)] += Math.abs(t.amount_cents); return acc },
    { juntos: 0, nat: 0, jen: 0, sem: 0 },
  )

  const abertas = parcelasAbertas(txs)
  const proximoMes = (() => {
    const [y, m] = mesAtual.split('-').map(Number)
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  })()
  const cronograma = cronogramaParcelas(abertas, proximoMes)
  const comprometido = cronograma.reduce((s, c) => s + c.total, 0)

  const anomalias = foraDaCurva(txs).filter((o) => !ehRecorrente(o.tx))
  const porMesAnomalia = new Map<string, typeof anomalias>()
  for (const a of anomalias) {
    const k = a.tx.transaction_date.slice(0, 7)
    const arr = porMesAnomalia.get(k)
    if (arr) arr.push(a)
    else porMesAnomalia.set(k, [a])
  }

  const { data: bills } = await supabase
    .from('fixed_bills').select('id, name').eq('user_id', user!.id)
  const nomeDaConta = new Map((bills ?? []).map((b) => [b.id as string, b.name as string]))
  const naturezas = porNatureza(txs, meses.map((m) => m.mes), nomeDaConta, mesAtual)

  const maiores = [...txs].filter((t) => !ehRecorrente(t))
    .sort((a, b) => Math.abs(b.amount_cents) - Math.abs(a.amount_cents)).slice(0, 10)

  if (txs.length === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="gd-display text-[34px]" style={{ color: 'var(--ink)' }}>Laudo</h1>
        <Chips recorte={recorte} />
        <div className="gd-empty mt-5">
          <p>{recorte === 'tudo'
            ? `Sem gastos em ${ano} ainda. O laudo aparece quando houver movimento.`
            : 'Nada neste recorte. Tente outro acima.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <header>
        <p className="gd-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-softer)' }}>
          {txs.length} gastos · {ano}{recorte !== 'tudo' && ` · ${RECORTES.find((r) => r.v === recorte)!.label.toLowerCase()}`}
        </p>
        <h1 className="gd-display mt-2 text-[clamp(34px,6vw,48px)]" style={{ color: 'var(--ink)' }}>
          o laudo <span style={{ color: 'var(--accent)' }}>✦</span>
        </h1>
        <p className="mt-2.5 max-w-xl text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Recalculado toda vez que vocês abrem — não é uma foto de setembro.
        </p>
        <Chips recorte={recorte} />
      </header>

      {/* ── números do topo ── */}
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {[
          { k: 'tudo que saiu', v: totalAno, cor: 'var(--ink)' },
          { k: 'mês típico no teto', v: medTeto, cor: 'var(--ink)' },
          { k: 'já comprometido em parcelas', v: comprometido, cor: comprometido > 0 ? 'var(--negative)' : 'var(--ink)' },
        ].map((x) => (
          <div key={x.k} className="gd-card" style={{ padding: 18 }}>
            <p className="gd-mono text-[26px] font-extrabold leading-none" style={{ color: x.cor, letterSpacing: '-0.03em' }}>
              <Money cents={x.v} />
            </p>
            <p className="mt-2 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>{x.k}</p>
          </div>
        ))}
      </div>

      <Secao n="01" titulo="Mês a mês" sub="Recorrente é conta fixa. Extraordinário é compra única acima de R$ 3.000 — fica fora do teto de propósito, porque teto mensal não segura carro nem viagem.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-[13px]">
            <thead>
              <tr>
                {['mês', 'recorrente', 'rotina', 'no teto', 'fora do teto'].map((h, i) => (
                  <th key={h} className={`gd-mono border-b px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wider ${i ? 'text-right' : 'text-left'}`}
                      style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-soft)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <td className="border-b px-2.5 py-1.5" style={{ borderColor: 'var(--line)', color: m.mes === mesAtual ? 'var(--ink-softer)' : 'var(--ink-2)' }}>
                    {rotulo(m.mes)}{m.mes === mesAtual && ' (em curso)'}
                  </td>
                  <td className="gd-mono border-b px-2.5 py-1.5 text-right" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}><Money cents={m.recorrente} /></td>
                  <td className="gd-mono border-b px-2.5 py-1.5 text-right" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}><Money cents={m.rotina} /></td>
                  <td className="gd-mono border-b px-2.5 py-1.5 text-right font-bold" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}><Money cents={m.noTeto} /></td>
                  <td className="gd-mono border-b px-2.5 py-1.5 text-right" style={{ borderColor: 'var(--line)', color: m.extraordinario ? 'var(--negative)' : 'var(--ink-softer)' }}>
                    {m.extraordinario ? <Money cents={m.extraordinario} /> : '—'}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-2.5 pt-2.5 text-[12px] font-bold" style={{ borderTop: '2px solid var(--accent)', color: 'var(--accent)' }}>mediana</td>
                <td className="gd-mono px-2.5 pt-2.5 text-right font-bold" style={{ borderTop: '2px solid var(--accent)', color: 'var(--accent)' }}><Money cents={medRec} /></td>
                <td className="gd-mono px-2.5 pt-2.5 text-right font-bold" style={{ borderTop: '2px solid var(--accent)', color: 'var(--accent)' }}><Money cents={medRot} /></td>
                <td className="gd-mono px-2.5 pt-2.5 text-right font-bold" style={{ borderTop: '2px solid var(--accent)', color: 'var(--accent)' }}><Money cents={medTeto} /></td>
                <td style={{ borderTop: '2px solid var(--accent)' }} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
          A mediana ignora o mês em curso. É dela que sai o ponto de partida pro teto — descontando o que acabou e somando o que começou.
        </p>
      </Secao>

      <Secao n="02" titulo="As cinco naturezas"
        sub="Não é sobre em que categoria caiu, é sobre o quanto dá pra mexer. Vermelho é mês acima de 1,5× o típico da linha.">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]" style={{ minWidth: `${13 + meses.length * 5.2}rem` }}>
            <thead>
              <tr>
                <th className="gd-mono border-b px-2.5 py-2 text-left text-[10.5px] font-bold uppercase tracking-wider"
                    style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-soft)' }}>natureza</th>
                {meses.map((m) => (
                  <th key={m.mes} className="gd-mono border-b px-2 py-2 text-right text-[10.5px] font-bold uppercase tracking-wider"
                      style={{ borderColor: 'var(--line-strong)', color: m.mes === mesAtual ? 'var(--ink-softer)' : 'var(--ink-soft)' }}>
                    {rotulo(m.mes)}
                  </th>
                ))}
                <th className="gd-mono border-b px-2.5 py-2 text-right text-[10.5px] font-bold uppercase tracking-wider"
                    style={{ borderColor: 'var(--line-strong)', color: 'var(--accent)' }}>típico</th>
              </tr>
            </thead>
            <tbody>
              {naturezas.map((l) => (
                <tr key={l.natureza}>
                  <td className="border-b px-2.5 py-2" style={{ borderColor: 'var(--line)' }}>
                    <span className="font-bold" style={{ color: 'var(--ink)' }}>{NATUREZA_LABEL[l.natureza]}</span>
                    <span className="block text-[10.5px]" style={{ color: 'var(--ink-softer)' }}>{NATUREZA_NOTA[l.natureza]}</span>
                  </td>
                  {l.porMes.map((v, i) => {
                    const emCurso = meses[i].mes === mesAtual
                    const alto = !emCurso && l.tipico > 0 && v >= l.tipico * 1.5
                    return (
                      <td key={i} className="gd-mono border-b px-2 py-2 text-right"
                          style={{
                            borderColor: 'var(--line)',
                            color: alto ? 'var(--negative)' : emCurso ? 'var(--ink-softer)' : 'var(--ink-2)',
                            fontWeight: alto ? 700 : 400,
                          }}>
                        {v ? <Money cents={v} /> : '·'}
                      </td>
                    )
                  })}
                  <td className="gd-mono border-b px-2.5 py-2 text-right font-bold"
                      style={{ borderColor: 'var(--line)', color: 'var(--accent)' }}>
                    <Money cents={l.tipico} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
          <b>Fixo</b> e <b>quase fixo</b> saem das contas fixas cadastradas — a diferença é se dá pra
          renegociar. <b>Parcelado</b> vence qualquer outra natureza: móvel em 12× é parcelado, não “casa”.
          E é a única que tem data pra acabar: quanto ainda falta está na seção 04.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {naturezas.map((l) => (
            <details key={l.natureza} className="gd-row px-4 py-3">
              <summary className="flex cursor-pointer items-baseline justify-between gap-3">
                <span className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
                  {NATUREZA_LABEL[l.natureza]}
                  <span className="ml-2 text-[12px] font-normal" style={{ color: 'var(--ink-softer)' }}>
                    {l.itens.length} {l.itens.length === 1 ? 'item' : 'itens'}
                  </span>
                </span>
                <span className="gd-mono shrink-0 text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
                  <Money cents={l.tipico} />/mês
                </span>
              </summary>
              <ul className="mt-3 flex flex-col">
                {l.itens.slice(0, 12).map((it) => (
                  <li key={it.nome} className="flex items-baseline justify-between gap-3 border-t py-1.5 text-[13px]"
                      style={{ borderColor: 'var(--line)' }}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate" style={{ color: 'var(--ink-2)' }}>{prettyName(it.nome)}</span>
                      <span className="gd-mono shrink-0 text-[10.5px]" style={{ color: 'var(--ink-softer)' }}>
                        {it.meses} {it.meses === 1 ? 'mês' : 'meses'}
                      </span>
                    </span>
                    <span className="gd-mono shrink-0" style={{ color: 'var(--ink-2)' }}>
                      <Money cents={it.tipico} />/mês
                    </span>
                  </li>
                ))}
                {l.itens.length > 12 && (
                  <li className="border-t pt-1.5 text-[12px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-softer)' }}>
                    e mais {l.itens.length - 12} item(ns) menor(es).
                  </li>
                )}
              </ul>
            </details>
          ))}
        </div>
      </Secao>

      {recorte === 'tudo' && (
        <Secao n="03" titulo="Quem gastou" sub="Gasto compartilhado costuma ser estável. Quando um mês estoura, quase sempre foi decisão individual.">
          <div className="flex flex-col gap-2">
            {(['juntos', 'jen', 'nat'] as Dono[]).map((d) => {
              const pct = totalAno > 0 ? (porDonoAno[d] / totalAno) * 100 : 0
              return (
                <div key={d} className="grid items-center gap-3" style={{ gridTemplateColumns: '5.5rem 1fr 6rem' }}>
                  <span className="text-[13px] font-semibold" style={{ color: DONO_COR[d] }}>{DONO_LABEL[d]}</span>
                  <span className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: DONO_COR[d] }} />
                  </span>
                  <span className="gd-mono text-right text-[13px] font-bold" style={{ color: 'var(--ink)' }}><Money cents={porDonoAno[d]} /></span>
                </div>
              )
            })}
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="gd-mono border-b px-2.5 py-2 text-left text-[10.5px] font-bold uppercase tracking-wider" style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-soft)' }}>mês</th>
                  {(['juntos', 'jen', 'nat'] as Dono[]).map((d) => (
                    <th key={d} className="gd-mono border-b px-2.5 py-2 text-right text-[10.5px] font-bold uppercase tracking-wider" style={{ borderColor: 'var(--line-strong)', color: DONO_COR[d] }}>{DONO_LABEL[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes}>
                    <td className="border-b px-2.5 py-1.5" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>{rotulo(m.mes)}</td>
                    {(['juntos', 'jen', 'nat'] as Dono[]).map((d) => (
                      <td key={d} className="gd-mono border-b px-2.5 py-1.5 text-right" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                        <Money cents={m.porDono[d]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao n="04" titulo="O que já está gasto"
        sub="Compra parcelada é decisão do passado que chega no futuro. Combinar o teto sem contar isso é estourar sem comprar nada.">
        {abertas.length === 0 ? (
          <div className="gd-empty"><p>Nenhuma parcela em aberto. Todo mês que vem está livre.</p></div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {cronograma.slice(0, 6).map((c) => (
                <div key={c.mes} className="gd-row px-3.5 py-2.5">
                  <p className="gd-mono text-[10.5px] uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>{rotulo(c.mes)}</p>
                  <p className="gd-mono mt-0.5 text-[15px] font-bold" style={{ color: 'var(--ink)' }}><Money cents={c.total} /></p>
                </div>
              ))}
            </div>
            <ul className="mt-4 flex flex-col">
              {abertas.slice(0, 10).map((p) => (
                <li key={`${p.nome}-${p.posicao}-${p.valorMes}`} className="flex items-baseline justify-between gap-3 border-b py-2 text-[13px]" style={{ borderColor: 'var(--line)' }}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate" style={{ color: 'var(--ink)' }}>{prettyName(p.nome)}</span>
                    <span className="gd-mono shrink-0 text-[11px]" style={{ color: 'var(--ink-softer)' }}>
                      {p.posicao}/{p.total} · <Money cents={p.valorMes} />/mês · {p.categoria}
                    </span>
                  </span>
                  <span className="gd-mono shrink-0 font-bold" style={{ color: DONO_COR[p.dono] }}><Money cents={p.aPagar} /></span>
                </li>
              ))}
            </ul>
            {abertas.length > 10 && (
              <p className="mt-2.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                e mais {abertas.length - 10} parcelamento(s) menor(es).
              </p>
            )}
          </>
        )}
      </Secao>

      <Secao n="05" titulo="Os maiores gastos únicos" sub="Sem contar conta fixa. É aqui que mora o que fez cada mês caro.">
        <ul className="flex flex-col">
          {maiores.map((t, i) => (
            <li key={`${t.transaction_date}-${i}`} className="flex items-baseline justify-between gap-3 border-b py-2 text-[13px]" style={{ borderColor: 'var(--line)' }}>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="gd-mono shrink-0 text-[11px]" style={{ color: 'var(--ink-softer)' }}>
                  {t.transaction_date.slice(8, 10)}/{t.transaction_date.slice(5, 7)}
                </span>
                <span className="truncate" style={{ color: 'var(--ink)' }}>{prettyName(nomeCurto(t))}</span>
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-softer)' }}>{t.categoria}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[11px]" style={{ color: DONO_COR[donoDe(t)] }}>{DONO_LABEL[donoDe(t)]}</span>
                <span className="gd-mono font-bold" style={{ color: 'var(--ink)' }}><Money cents={Math.abs(t.amount_cents)} /></span>
              </span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao n="06" titulo="Fora da curva, mês a mês"
        sub="Alto pra a PRÓPRIA categoria — aluguel de todo mês não é anomalia, restaurante de R$ 737 é. Conta fixa fica de fora da lista.">
        {porMesAnomalia.size === 0 ? (
          <div className="gd-empty"><p>Nada fugiu do padrão neste ano. Raro e bom.</p></div>
        ) : (
          [...porMesAnomalia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, lista]) => (
            <div key={mes} className="mb-5 border-l-2 pl-3.5 last:mb-0" style={{ borderColor: 'var(--accent-soft)' }}>
              <p className="gd-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{rotulo(mes)}</p>
              <ul className="mt-1.5 flex flex-col">
                {lista.slice(0, 6).map((o, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate" style={{ color: 'var(--ink)' }}>{prettyName(nomeCurto(o.tx))}</span>
                      <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-softer)' }}>
                        {o.tx.categoria} · típico <Money cents={o.tipico} />
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="gd-mono text-[11px] font-bold" style={{ color: 'var(--negative)' }}>{Math.round(o.vezes)}×</span>
                      <span className="gd-mono font-bold" style={{ color: 'var(--ink)' }}><Money cents={Math.abs(o.tx.amount_cents)} /></span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Secao>

      <Secao n="07" titulo="Como ler isto">
        <Faixa titulo="O teto não segura gasto grande — e nem deveria">
          Compra única acima de R$ 3.000 sai do teto de propósito. O que segura esse tipo de gasto é
          planejar com antecedência, não apertar o mês.
        </Faixa>
        <Faixa titulo="“Fora da curva” é relativo, não absoluto">
          A régua é a mediana da própria categoria com desvio absoluto mediano — que não se distorce
          pelos outliers que está procurando. Categoria com menos de 4 gastos não entra: não há base.
        </Faixa>
        <Faixa tom="alerta" titulo="Parcela some da conta se ninguém olhar">
          O número de cada mês inclui parcelas de compras antigas. Por isso a seção 03 existe: sem ela,
          o teto é combinado sobre dinheiro que já foi gasto.
        </Faixa>
      </Secao>
    </div>
  )
}
