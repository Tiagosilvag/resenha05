export interface CriarPreapprovalInput {
  accessToken: string;
  reason: string;
  externalReference: string;
  payerEmail: string;
  valorCentavos: number;
  backUrl: string;
}

export interface PreapprovalCriado {
  id: string;
  initPoint: string;
}

export interface PreapprovalDetalhe {
  id: string;
  status: 'authorized' | 'paused' | 'cancelled' | 'pending';
  externalReference: string;
  valorCentavos: number;
}

const BASE_URL = 'https://api.mercadopago.com/preapproval';

async function corpoDeErro(resp: { json: () => Promise<unknown> }): Promise<string> {
  try {
    const j = (await resp.json()) as { message?: string };
    return j.message ?? 'Erro desconhecido do Mercado Pago.';
  } catch {
    return 'Erro desconhecido do Mercado Pago.';
  }
}

/** Cria uma assinatura recorrente (preapproval) no Mercado Pago. */
export async function criarPreapproval(
  input: CriarPreapprovalInput,
  fetchFn: typeof fetch = fetch,
): Promise<PreapprovalCriado> {
  const resp = await fetchFn(BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.valorCentavos / 100,
        currency_id: 'BRL',
      },
    }),
  });
  if (!resp.ok) throw new Error(await corpoDeErro(resp));
  const j = (await resp.json()) as { id: string; init_point: string };
  return { id: j.id, initPoint: j.init_point };
}

/** Busca o status atual de um preapproval (usado ao processar o webhook). */
export async function buscarPreapproval(
  accessToken: string,
  preapprovalId: string,
  fetchFn: typeof fetch = fetch,
): Promise<PreapprovalDetalhe> {
  const resp = await fetchFn(`${BASE_URL}/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(await corpoDeErro(resp));
  const j = (await resp.json()) as {
    id: string;
    status: PreapprovalDetalhe['status'];
    external_reference: string;
    auto_recurring: { transaction_amount: number };
  };
  return {
    id: j.id,
    status: j.status,
    externalReference: j.external_reference,
    valorCentavos: Math.round(j.auto_recurring.transaction_amount * 100),
  };
}
