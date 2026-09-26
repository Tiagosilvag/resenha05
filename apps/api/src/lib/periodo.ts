/** Primeiro dia do mês da data (em UTC), como YYYY-MM-DD — independe do fuso do servidor. */
export function primeiroDiaDoMesUtc(data: Date): string {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
