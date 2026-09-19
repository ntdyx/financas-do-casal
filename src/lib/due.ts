/**
 * QUANDO cada conta tem que ser paga.
 *
 * Antes deste arquivo o app nao tinha nocao de vencimento: o unico "quando" era
 * a MEDIANA do dia em que a conta caiu no passado (computeExpectedDays). Isso
 * aprende o atraso — se a luz vence dia 15 e o casal sempre paga dia 22, o "dia
 * esperado" vira 22 e o app so reclama dia 23, com a multa ja cobrada. E conta
 * nova, sem historico, nunca gerava aviso nenhum.
 *
 * Aqui o vencimento e um DADO (fixed_bills.due_day), e o app empurra ANTES.
 *
 * Sem alias `@/` e sem dependencia externa: este arquivo roda no `node --test`.
 * Datas sao strings 'YYYY-MM-DD' e meses 'YYYY-MM' — comparaveis com < e >, sem
 * fuso pra atrapalhar. Onde precisa de calendario, usa Date em UTC ao meio-dia.
 */

/** Quantos dias antes do vencimento a conta ja aparece como "essa semana". */
export const JANELA_SEMANA = 7

export type BillStatus =
  | 'atrasada'   // passou o prazo e nao caiu — pagar AGORA
  | 'hoje'       // vence hoje (ou o fim de semana do vencimento) — pagar AGORA
  | 'semana'     // vence nos proximos 7 dias
  | 'futura'     // vence depois disso
  | 'sem_dia'    // ninguem cadastrou o dia do vencimento
  | 'paga'       // caiu no extrato neste mes
  | 'resolvida'  // marcada na mao (pagamento em outro mes / fora das contas)
  | 'nao_caiu'   // mes encerrado sem cair — assunto do Fechamento, nao do empurrao

/* ─────────────────────────────── datas cruas ─────────────────────────────── */

const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Quantos dias tem o mes 'YYYY-MM'. */
export function diasNoMes(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 0 = domingo … 6 = sabado. */
export function diaDaSemana(data: string): number {
  return asDate(data).getUTCDay()
}

export function somaDias(data: string, n: number): string {
  const d = asDate(data)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** Dias de `a` até `b` (negativo se `b` ja passou). */
export function diasEntre(a: string, b: string): number {
  return Math.round((asDate(b).getTime() - asDate(a).getTime()) / 86_400_000)
}

const fimDeSemana = (data: string) => {
  const d = diaDaSemana(data)
  return d === 0 || d === 6
}

/**
 * Data do vencimento dentro do mes. Dia 31 em mes de 30 dias (ou fevereiro) cai
 * no ULTIMO dia — quem cadastrou "31" quis dizer "fim do mes", nao dia 1 do mes
 * seguinte.
 */
export function vencimentoNoMes(dueDay: number, ym: string): string {
  const ultimo = diasNoMes(ym)
  const dia = Math.min(Math.max(Math.trunc(dueDay) || 1, 1), ultimo)
  return `${ym}-${String(dia).padStart(2, '0')}`
}

/**
 * Dia em que o app comeca a dizer "pague hoje". Vencimento em fim de semana
 * ANTECIPA pra sexta: banco nao processa boleto no sabado, e avisar depois do
 * vencimento nao serve pra nada. Nunca sai do mes — antecipar o dia 1 que caiu
 * num domingo levaria pra outro mes, que e outra conta.
 */
export function diaDeCobranca(dueDay: number, ym: string): string {
  let d = vencimentoNoMes(dueDay, ym)
  const primeiro = `${ym}-01`
  while (fimDeSemana(d) && d > primeiro) d = somaDias(d, -1)
  return d
}

/**
 * Ultimo dia sem atraso. Vencimento em fim de semana ADIA pra segunda: boleto
 * de sabado/domingo se paga na segunda sem multa, e acusar atraso num dia em que
 * ainda da pra pagar sem juros ensina a ignorar o aviso.
 */
export function prazoFinal(dueDay: number, ym: string): string {
  let d = vencimentoNoMes(dueDay, ym)
  while (fimDeSemana(d)) d = somaDias(d, 1)
  return d
}

/* ────────────────────────────── status da conta ────────────────────────────── */

export interface BillStatusInput {
  dueDay: number | null
  /** Mes da conta, 'YYYY-MM'. */
  mes: string
  /** Hoje, 'YYYY-MM-DD' (no fuso de Sao Paulo). */
  hoje: string
  /** Caiu no extrato deste mes (transacao com fixed_bill_id). */
  paid: boolean
  /** Resolvida na mao (fixed_bill_marks). */
  manual: boolean
  /** Mes ja fechado no Fechamento. */
  fechado?: boolean
}

export function statusDaConta({ dueDay, mes, hoje, paid, manual, fechado }: BillStatusInput): BillStatus {
  // Pago vem antes de tudo: conta paga — inclusive paga ADIANTADA — nao cobra.
  if (paid) return 'paga'
  if (manual) return 'resolvida'
  // Mes assinado no Fechamento: reabrir cobranca ali so gera ruido.
  if (fechado) return 'nao_caiu'

  const hojeMes = hoje.slice(0, 7)
  if (mes > hojeMes) return 'futura'
  if (dueDay == null) return mes < hojeMes ? 'nao_caiu' : 'sem_dia'

  const cobra = diaDeCobranca(dueDay, mes)
  const prazo = prazoFinal(dueDay, mes)

  // `hoje <= prazo` decide antes do mes, porque o prazo de uma conta do dia 28
  // de fevereiro (sabado) e 2 de marco: no dia 1 ela ainda esta em tempo.
  if (hoje > prazo) return mes < hojeMes ? 'nao_caiu' : 'atrasada'
  if (hoje >= cobra) return 'hoje'
  return diasEntre(hoje, cobra) <= JANELA_SEMANA ? 'semana' : 'futura'
}

/** Merece empurrao (aviso na cara e e-mail): so o que da pra pagar HOJE. */
export function precisaPagarAgora(s: BillStatus): boolean {
  return s === 'atrasada' || s === 'hoje'
}

/* ──────────────────────────── lista da tela / e-mail ──────────────────────────── */

export interface ContaAPagarInput {
  id: string
  label: string
  emoji: string
  dueDay: number | null
  paid: boolean
  manual: boolean
  /** Quanto caiu neste mes (0 se nao caiu). */
  amount: number
  /** Valor tipico da conta, aprendido do historico (0 se nao sabe). */
  typical: number
  /**
   * true quando `dueDay` nao foi cadastrado e veio do historico (dia em que ela
   * costuma ser PAGA). Palpite: pode ser justamente o dia atrasado, entao a tela
   * e o e-mail dizem que e aproximado.
   */
  palpite?: boolean
}

export interface ContaAPagar extends ContaAPagarInput {
  status: BillStatus
  vencimento: string | null
  /** Dias até o vencimento (negativo = passou). null sem dia cadastrado. */
  diasAte: number | null
}

/** Ordem da tela: o que cobra primeiro, o que ja acabou no fim. */
const PESO: Record<BillStatus, number> = {
  atrasada: 0, hoje: 1, semana: 2, sem_dia: 3, futura: 4, nao_caiu: 5, resolvida: 6, paga: 7,
}

export function contasAPagar(
  items: ContaAPagarInput[],
  { mes, hoje, fechado }: { mes: string; hoje: string; fechado?: boolean },
): ContaAPagar[] {
  return items
    .map((c) => {
      const status = statusDaConta({ ...c, mes, hoje, fechado })
      const vencimento = c.dueDay == null ? null : vencimentoNoMes(c.dueDay, mes)
      return { ...c, status, vencimento, diasAte: vencimento ? diasEntre(hoje, vencimento) : null }
    })
    .sort((a, b) =>
      PESO[a.status] - PESO[b.status] ||
      (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999') ||
      a.label.localeCompare(b.label))
}

/**
 * Valor TIPICO de cada conta, aprendido do historico: a media do que ela custou
 * nos meses passados. Serve pro empurrao dizer "Luz, ~R$ 320" ANTES de a conta
 * cair — sem isso o aviso manda pagar sem dizer quanto. Vive aqui, e nao em
 * fixed.ts, porque fixed.ts importa o client do Supabase e nao roda no teste.
 * Contas sem historico ficam de fora (nao da pra chutar).
 */
export function valoresTipicos(
  txs: { fixed_bill_id: string | null; amount_cents: number }[],
): Map<string, number> {
  const somas = new Map<string, { total: number; n: number }>()
  for (const t of txs) {
    if (!t.fixed_bill_id) continue
    const s = somas.get(t.fixed_bill_id) ?? { total: 0, n: 0 }
    s.total += Math.abs(t.amount_cents)
    s.n++
    somas.set(t.fixed_bill_id, s)
  }
  const out = new Map<string, number>()
  for (const [id, s] of somas) out.set(id, Math.round(s.total / s.n))
  return out
}

/* ───────────────────────────── fatura do cartao ───────────────────────────── */

export interface FaturaInput {
  id: string
  name: string
  /** accounts.balance_due_date — vem da Pluggy. */
  dueDate: string | null
  amount: number
}

export interface Fatura extends FaturaInput {
  dueDate: string
  status: Extract<BillStatus, 'hoje' | 'semana' | 'futura'>
  diasAte: number
}

/**
 * Fatura de cartao: a maior conta do mes, e a unica com data de vencimento REAL
 * vinda do banco. Empurra antes de vencer e nunca diz "atrasada": a Pluggy rola
 * o `balance_due_date` pra frente depois do pagamento, entao data no passado nao
 * prova atraso nenhum — acusaria fatura paga de atrasada.
 */
export function faturasAPagar(items: FaturaInput[], hoje: string): Fatura[] {
  return items
    .filter((f): f is FaturaInput & { dueDate: string } => !!f.dueDate)
    .map((f) => {
      const diasAte = diasEntre(hoje, f.dueDate)
      const status: Fatura['status'] =
        diasAte === 0 ? 'hoje' : diasAte > 0 && diasAte <= JANELA_SEMANA ? 'semana' : 'futura'
      return { ...f, status, diasAte }
    })
    .sort((a, b) => PESO[a.status] - PESO[b.status] || a.dueDate.localeCompare(b.dueDate))
}
