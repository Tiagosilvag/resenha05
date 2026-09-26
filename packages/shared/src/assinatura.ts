import type { StatusAssinatura } from './schemas/admin-plataforma.js';

/** Só organização com mensalidade em dia pode receber novos membros ou peladas. */
export function organizacaoLiberada(status: StatusAssinatura): boolean {
  return status === 'ativa';
}

export type StatusPreapprovalMp = 'authorized' | 'paused' | 'cancelled' | 'pending';
export type StatusCicloAssinatura = 'aprovado' | 'atrasado' | 'cancelado';

/**
 * Mapeia o status do preapproval do Mercado Pago pro nosso modelo. Não
 * distingue eventos de pagamento por ciclo — v1 deriva tudo do status do
 * preapproval em si (ver spec).
 */
export function interpretarStatusPreapproval(
  statusMp: StatusPreapprovalMp,
): { statusAssinatura: StatusAssinatura; statusCiclo: StatusCicloAssinatura } {
  if (statusMp === 'authorized') {
    return { statusAssinatura: 'ativa', statusCiclo: 'aprovado' };
  }
  if (statusMp === 'cancelled') {
    return { statusAssinatura: 'cancelada', statusCiclo: 'cancelado' };
  }
  // 'pending' | 'paused'
  return { statusAssinatura: 'inadimplente', statusCiclo: 'atrasado' };
}
