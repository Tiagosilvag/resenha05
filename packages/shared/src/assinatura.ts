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
 * preapproval em si (simplificação do plano; a spec prevê uma linha por ciclo).
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

/**
 * Status final da organização depois de um evento de UMA assinatura: se outra
 * assinatura da mesma organização está aprovada, ela continua ativa — um
 * evento de assinatura abandonada/antiga não pode derrubar quem está pagando.
 */
export function derivarStatusOrganizacao(
  statusDoEvento: StatusAssinatura,
  statusCiclosDaOrganizacao: StatusCicloAssinatura[] | readonly string[],
): StatusAssinatura {
  return statusCiclosDaOrganizacao.includes('aprovado') ? 'ativa' : statusDoEvento;
}

/** Quem já está ativa não abre novo checkout (evita cobrança em dobro). */
export function podeIniciarCheckout(status: StatusAssinatura): boolean {
  return status !== 'ativa';
}
