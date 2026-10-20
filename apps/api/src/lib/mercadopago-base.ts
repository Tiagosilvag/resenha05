/**
 * Endereço da API do Mercado Pago. Só muda (MP_API_BASE) para testar contra um
 * servidor de mentira; em produção é sempre o oficial.
 */
export function mpApi(): string {
  return process.env.MP_API_BASE ?? 'https://api.mercadopago.com';
}
