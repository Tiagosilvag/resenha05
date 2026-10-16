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

// --- Liberação manual (admin da plataforma libera um mês sem passar pelo MP) ---

/** Prefixo do `mp_preapproval_id` das linhas de `assinaturas` criadas à mão. */
export const PREFIXO_LIBERACAO_MANUAL = 'manual-';

/** Até quantos meses à frente (contando o atual) dá para liberar de uma vez. */
export const MESES_MAX_ADIANTE = 12;

export function idLiberacaoManual(organizacaoId: string): string {
  return `${PREFIXO_LIBERACAO_MANUAL}${organizacaoId}`;
}

export function ehLiberacaoManual(mpPreapprovalId: string): boolean {
  return mpPreapprovalId.startsWith(PREFIXO_LIBERACAO_MANUAL);
}

/** Último dia do mês de um período ('YYYY-MM-01') — o dia em que a liberação vence. */
export function fimDoMes(periodoIso: string): string {
  const [ano, mes] = periodoIso.slice(0, 10).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

function mesIndice(periodoIso: string): number {
  const [ano, mes] = periodoIso.slice(0, 10).split('-').map(Number) as [number, number];
  return ano * 12 + (mes - 1);
}

function indiceParaPeriodo(indice: number): string {
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

/**
 * Qual mês o botão "liberar" libera: o mês atual (em Brasília) ou, se a
 * liberação já cobre o atual, o seguinte a ela. Liberar de novo estende.
 */
export function proximoMesALiberar(ultimoPeriodoManual: string | null, agora: Date): string {
  const emBrasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const atual = emBrasilia.getUTCFullYear() * 12 + emBrasilia.getUTCMonth();
  const alvo = ultimoPeriodoManual ? Math.max(atual, mesIndice(ultimoPeriodoManual) + 1) : atual;
  if (alvo - atual >= MESES_MAX_ADIANTE) {
    throw new Error(`Não dá para liberar mais de ${MESES_MAX_ADIANTE} meses adiante.`);
  }
  return indiceParaPeriodo(alvo);
}
