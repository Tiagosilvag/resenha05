/** Centavos (inteiro) → "R$ 49,90". */
export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Reais (número ou string numérica, ex. do banco) → "R$ 10,00". */
export function formatarReais(reais: number | string): string {
  return Number(reais).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
