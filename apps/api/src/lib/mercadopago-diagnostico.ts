import type { AssinaturaDiagnostico, ContaDiagnostico, PagamentoDiagnostico } from '@resenha05/shared';
import { mpApi } from './mercadopago-base.js';
import { erroDoMp } from './mercadopago-preapproval.js';

async function obter(accessToken: string, caminho: string, fetchFn: typeof fetch): Promise<Record<string, unknown>> {
  const resp = await fetchFn(`${mpApi()}${caminho}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw await erroDoMp(resp);
  return (await resp.json()) as Record<string, unknown>;
}

const texto = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

export interface ContaDetalhada extends ContaDiagnostico {
  nickname: string | null;
}

/** Conta vendedora dona do Access Token salvo (o que o Mercado Pago enxerga como "collector"). */
export async function consultarContaDetalhada(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<ContaDetalhada> {
  const j = await obter(accessToken, '/users/me', fetchFn);
  const tags = Array.isArray(j.tags) ? (j.tags as string[]) : [];
  return {
    id: texto(j.id),
    nickname: texto(j.nickname),
    email: texto(j.email),
    siteId: texto(j.site_id),
    ehTeste: tags.includes('test_user'),
  };
}

export interface AssinaturaDetalhada extends AssinaturaDiagnostico {
  id: string;
  motivo: string | null;
  valor: number | null;
  criadaEm: string | null;
  proximaCobranca: string | null;
  collectorId: string | null;
}

export async function consultarAssinaturaDetalhada(
  accessToken: string,
  preapprovalId: string,
  fetchFn: typeof fetch = fetch,
): Promise<AssinaturaDetalhada> {
  const j = await obter(accessToken, `/preapproval/${encodeURIComponent(preapprovalId)}`, fetchFn);
  const recorrente = (j.auto_recurring ?? {}) as { transaction_amount?: number };
  return {
    id: String(j.id ?? preapprovalId),
    status: String(j.status ?? 'desconhecido'),
    payerId: texto(j.payer_id),
    payerEmail: texto(j.payer_email),
    collectorId: texto(j.collector_id),
    motivo: texto(j.reason),
    valor: typeof recorrente.transaction_amount === 'number' ? recorrente.transaction_amount : null,
    criadaEm: texto(j.date_created),
    proximaCobranca: texto(j.next_payment_date),
  };
}

export interface PagamentoDetalhado extends PagamentoDiagnostico {
  id: string;
  meio: string | null;
  valor: number | null;
  criadoEm: string | null;
  externalReference: string | null;
}

/** Uma operação (o "#" que o Mercado Pago mostra na tela de recusa). */
export async function consultarPagamentoDetalhado(
  accessToken: string,
  pagamentoId: string,
  fetchFn: typeof fetch = fetch,
): Promise<PagamentoDetalhado> {
  const j = await obter(accessToken, `/v1/payments/${encodeURIComponent(pagamentoId)}`, fetchFn);
  const pagador = (j.payer ?? {}) as { id?: unknown; email?: unknown };
  return {
    id: String(j.id ?? pagamentoId),
    status: String(j.status ?? 'desconhecido'),
    statusDetail: texto(j.status_detail),
    payerId: texto(pagador.id),
    payerEmail: texto(pagador.email),
    meio: texto(j.payment_method_id),
    valor: typeof j.transaction_amount === 'number' ? j.transaction_amount : Number(j.transaction_amount) || null,
    criadoEm: texto(j.date_created),
    externalReference: texto(j.external_reference),
  };
}
