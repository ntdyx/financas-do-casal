/**
 * Decide se o cron manda o e-mail de "o mes nao vai fechar". Funcao pura pra a
 * regra ficar testavel — a rota so faz I/O.
 *
 * A regua e a sobra do TETO combinado, nao o habito: comparar com a propria
 * media mente quando a media ja e cara ("no ritmo" enquanto afunda).
 */
export function deveAlertar(p: {
  sobra: number
  jaAlertou: boolean
  diaDoMes: number
  /** Ha teto combinado pra este mes? Sem regua nao ha o que alertar. */
  temTeto: boolean
}): boolean {
  if (p.jaAlertou) return false    // um e-mail por mes, so
  if (!p.temTeto) return false     // sem teto: nao da pra dizer que nao cabe
  if (p.diaDoMes < 5) return false // projecao instavel no comeco do mes
  return p.sobra < 0
}
