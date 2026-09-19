/**
 * "Nome misterioso": gasto cujo nome nao diz de onde veio — Pix pra pessoa
 * fisica, intermediador de pagamento (PAY2ALL, SF PAGAMENTOS), transferencia
 * largada em categoria generica ou compra que ficou sem categoria. Um mes
 * depois ninguem lembra; o e-mail semanal (api/cron/nomes-misteriosos) pede
 * uma observacao enquanto ainda da.
 *
 * Basta explicar UMA vez: se algum gasto anterior pro mesmo destinatario ja tem
 * observacao, os proximos nao voltam a ser perguntados.
 */

export interface MistTx {
  id: string
  description: string | null
  note: string | null
  categoria: string | null
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Transferencias vem como "Prefixo|NOME"; o que importa e o nome. */
export function destinatario(description: string | null | undefined): string {
  const d = (description ?? '').trim()
  return d.includes('|') ? d.slice(d.lastIndexOf('|') + 1).trim() : d
}

const chave = (description: string | null) =>
  semAcento(destinatario(description)).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

// Palavras que so aparecem em razao social. "S"/"A" soltos pegam "TIM S A".
const EMPRESA = new Set([
  'LTDA', 'SA', 'S', 'A', 'ME', 'EPP', 'EIRELI', 'MEI', 'SS', 'BR', 'CIA',
  'SERVICOS', 'COMERCIO', 'COMERCIAL', 'BANCO', 'COPIADORA', 'PAPELARIA',
  'FARMACIA', 'INSTITUICAO', 'PAGAMENTO', 'PAGAMENTOS', 'TECNOLOGIA',
  'PSICOLOGIA', 'CONSULTORIA', 'ESTACIONAMENTO', 'OFICIAL', 'REGISTRO',
  'ACADEMIA', 'RESTAURANTE', 'LOJA', 'MEDICOS', 'CLINICA', 'DISTRIBUIDORA',
  'ARTIGOS', 'ESPACO', 'EXPRESS', 'PARK', 'TICKET', 'PRINT', 'DIGITAL', 'STORE', 'SHOP',
])

// Quem so repassa o dinheiro: o nome nunca diz o que foi comprado.
const INTERMEDIADOR = /PAY2ALL|SF PAGAMENTOS|PAGSEGURO|PAGBANK|MERCADO ?PAGO|PICPAY|STONE|CIELO|GETNET|SUMUP|INFINITEPAY|INSTITUICAO DE PAGAMENTO/

const GENERICAS = new Set(['Transferências', 'Outros'])

// Cobranca do proprio banco: sem categoria, mas o nome ja diz o que e.
const TARIFA = /^(JUROS|MULTA|IOF|ENCARGOS|TARIFA|ANUIDADE)\b/

/** 2 a 6 palavras so de letras (inicial com ponto vale), nenhuma de empresa. */
export function pareceNomeDePessoa(nome: string): boolean {
  const palavras = semAcento(nome).toUpperCase().split(/\s+/).filter(Boolean)
  if (palavras.length < 2 || palavras.length > 6) return false
  return palavras.every((p) => /^[A-Z]{2,}$|^[A-Z]\.$/.test(p) && !EMPRESA.has(p.replace('.', '')))
}

/**
 * Filtra os gastos que precisam de explicacao. `jaExplicados` sao gastos
 * de qualquer epoca com observacao — servem pra reconhecer quem ja foi explicado.
 */
export function misteriosos<T extends MistTx>(
  txs: T[],
  jaExplicados: { description: string | null; note: string | null }[],
): T[] {
  const conhecidos = new Set(jaExplicados.filter((t) => (t.note ?? '').trim()).map((t) => chave(t.description)))
  return txs.filter((t) => {
    if ((t.note ?? '').trim()) return false
    const k = chave(t.description)
    if (!k || conhecidos.has(k)) return false
    if (TARIFA.test(k)) return false
    // Compra de cartao traz o nome da loja; so pergunta se ficou sem categoria.
    if (!(t.description ?? '').includes('|')) return t.categoria == null
    // Boleto e sempre de empresa ("SAO PAULO II" nao e gente).
    const boleto = /^pagamento/i.test(t.description ?? '')
    return (!boleto && pareceNomeDePessoa(destinatario(t.description)))
      || INTERMEDIADOR.test(k)
      || t.categoria == null || GENERICAS.has(t.categoria)
  })
}
