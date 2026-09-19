import { P1, P2 } from '@/lib/casal'
import { Money } from '@/components/money'
import type { MesExtra } from '@/lib/mes-extra'
import { TetoForm } from './teto-form'

export interface TetoFuturo { valor: number; mes: string }

interface RecorrenteItem {
  name: string
  amount: number
  prevAmount: number | null
}

interface Props {
  /** Mes exibido ('YYYY-MM') — o teto que se define aqui e o DESTE mes. */
  mes: string
  extra: MesExtra
  teto: number | null
  /** Teto combinado que so passa a valer no mes seguinte ao exibido. */
  tetoFuturo: TetoFuturo | null
  recorrentes: RecorrenteItem[]
  recorrenteTipico: number
  /** Rotina mediana dos meses fechados — referencia pra calibrar o teto. */
  rotinaTipica: number
  /** Saldo: quanto ainda da pra gastar ate o fim do mes. Null = sem teto. */
  disponivel: number | null
  /** Como o mes termina se o ritmo continuar. Null em mes fechado ou sem teto. */
  sobraPrevista: number | null
}

/**
 * Responde "quanto ainda da pra gastar?" — a pergunta que o donut ao lado nao
 * responde, porque la o aluguel pesa igual ao iFood.
 *
 * O numero grande e SALDO, nao projecao. A projecao fica embaixo, pequena: ela
 * informa, mas nao e o que se usa pra decidir se da pra pedir um jantar hoje.
 *
 * A regua e o TETO do mes. Sem teto definido o card nao inventa numero nenhum:
 * pede o teto, e mostra a rotina tipica pra a pessoa ter em que se basear.
 */
export function MesCard({
  mes, extra, teto, tetoFuturo, recorrentes, recorrenteTipico, rotinaTipica, disponivel, sobraPrevista,
}: Props) {
  const recorrenteRealizado = recorrentes.reduce((s, r) => s + r.amount, 0)
  const rotinaTotal = extra.casal + extra.nat + extra.jen
  const semTeto = teto == null || disponivel == null
  const noVermelho = disponivel != null && disponivel < 0

  // Barra do teto: mede TUDO que sai contra o teto — recorrente (pelo tipico,
  // porque a fixa que ainda nao caiu ja tem dono) mais a rotina de todas. Antes
  // media so o extra do casal, e por isso a barra podia ficar tranquila com o
  // mes inteiro estourado.
  const contraOTeto = recorrenteTipico + rotinaTotal
  const pctTeto = teto && teto > 0 ? Math.min(100, Math.round((contraOTeto / teto) * 100)) : null
  const estourouTeto = teto != null && contraOTeto > teto

  return (
    <section className="rounded-[18px] px-5 pb-4 pt-[18px]" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      {/* A resposta: quanto ainda da pra gastar */}
      <div className="pb-4">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-soft)' }}>
          {semTeto ? 'Combinem o teto do mês' : noVermelho ? 'Você já passou do que cabia' : 'Ainda dá pra gastar'}
        </p>
        {semTeto ? (
          <p className="mt-1 text-[15px]" style={{ color: 'var(--ink-softer)' }}>
            sem teto não dá pra dizer quanto cabe
            {rotinaTipica > 0 && (
              <> — a rotina de vocês costuma ser <Money cents={rotinaTipica} /> por mês</>
            )}
          </p>
        ) : (
          <>
            <p
              className="gd-mono mt-1 text-[40px] font-extrabold leading-none"
              style={{ letterSpacing: '-0.035em', color: noVermelho ? 'var(--negative)' : 'var(--positive)' }}
            >
              <Money cents={disponivel} />
            </p>
            {sobraPrevista !== null && (
              <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-softer)' }}>
                no ritmo de hoje, o mês fecha com <Money cents={sobraPrevista} />
              </p>
            )}
          </>
        )}
      </div>

      {/* @container + @sm: o card mora numa coluna estreita na home (~325px em
          1024px de janela), mas `sm:` olha a JANELA, não o container — então as
          duas colunas entravam com 150px cada e "Todo mês" colidia com o valor.
          Container query deixa o card decidir pela própria largura. */}
      <div className="@container grid gap-5 border-t pt-4 @sm:grid-cols-2" style={{ borderColor: 'var(--line)' }}>
        {/* O que nao esta na sua mao este mes */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>Todo mês</span>
            <span className="gd-mono shrink-0 text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
              <Money cents={recorrenteRealizado} />
            </span>
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-softer)' }}>
            já caiu{recorrenteTipico > 0 && <> · esperado <Money cents={recorrenteTipico} /></>}
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {recorrentes.length === 0 && (
              <li className="text-[13px]" style={{ color: 'var(--ink-softer)' }}>Nada recorrente ainda neste mês.</li>
            )}
            {recorrentes.slice(0, 6).map((r) => {
              const subiu = r.prevAmount != null && r.amount > r.prevAmount
              return (
                <li key={r.name} className="flex items-baseline justify-between gap-2 text-[13px]">
                  {/* Sem truncate: nome cortado ("TRANSFERENCIA RECEBI...") nao diz
                      nada. Melhor quebrar em duas linhas do que esconder. */}
                  <span className="min-w-0 break-words" style={{ color: 'var(--ink-2)' }}>{r.name}</span>
                  <span className="flex shrink-0 items-baseline gap-1 gd-mono" style={{ color: subiu ? 'var(--negative)' : 'var(--ink-2)' }}>
                    {subiu && <span title="subiu em relação ao mês passado">↑</span>}
                    <Money cents={r.amount} />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* O que esta na sua mao */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>Rotina</span>
            <span className="gd-mono shrink-0 text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
              <Money cents={rotinaTotal} />
            </span>
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-softer)' }}>o que dá pra cortar</p>

          <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px]">
            <li className="flex items-baseline justify-between gap-2">
              <span style={{ color: 'var(--ink-2)' }}>casal</span>
              <span className="gd-mono shrink-0" style={{ color: 'var(--ink-2)' }}><Money cents={extra.casal} /></span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span style={{ color: 'var(--ink-2)' }}>{P1.name}</span>
              <span className="gd-mono shrink-0" style={{ color: 'var(--na)' }}><Money cents={extra.nat} /></span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span style={{ color: 'var(--ink-2)' }}>{P2.name}</span>
              <span className="gd-mono shrink-0" style={{ color: 'var(--je)' }}><Money cents={extra.jen} /></span>
            </li>
          </ul>

          {/* Tudo que sai contra o teto — a linha do "equilibrio do mes". */}
          <div className="mt-3.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>Tudo que sai</span>
              <span className="gd-mono shrink-0" style={{ color: estourouTeto ? 'var(--negative)' : 'var(--ink-2)' }}>
                <Money cents={contraOTeto} />
                {teto != null && <span style={{ color: 'var(--ink-softer)' }}> de <Money cents={teto} /></span>}
              </span>
            </div>
            {pctTeto != null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
                <div className="h-full rounded-full" style={{ width: `${pctTeto}%`, background: estourouTeto ? 'var(--negative)' : 'var(--accent)' }} />
              </div>
            )}
            {extra.extraordinario > 0 && (
              /* Compra unica grande nao disputa o teto: e decisao de patrimonio,
                 nao ritmo do mes. Fica visivel, mas fora da conta. */
              <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-softer)' }}>
                + <Money cents={extra.extraordinario} /> em compras únicas — fora do teto
              </p>
            )}
          </div>

          <TetoForm mes={mes} atual={teto} futuro={tetoFuturo} />
        </div>
      </div>
    </section>
  )
}
