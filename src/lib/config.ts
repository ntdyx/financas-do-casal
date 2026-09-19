import { SPLIT_LABEL } from './casal'

/**
 * Configurações do app Gastadeiras.
 */

/**
 * Data de corte do tagueamento. Transações anteriores são importadas,
 * mas o foco de categoria/divisão e os resumos começam a partir daqui.
 */
export const TAGGING_START_DATE = '2026-04-01'

/** Os dois métodos de divisão padrão por dono de conta. */
export const SPLIT_METHODS = [
  { value: 100, label: SPLIT_LABEL['100'] },
  { value: 50,  label: SPLIT_LABEL['50'] },
  { value: 25,  label: SPLIT_LABEL['25'] },
  { value: 0,   label: SPLIT_LABEL['0'] },
] as const
