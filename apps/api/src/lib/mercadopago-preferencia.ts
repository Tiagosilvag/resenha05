import { mpApi } from './mercadopago-base.js';
import { erroDoMp } from './mercadopago-preapproval.js';

export interface CriarPreferenciaInput {
  accessToken: string;
  titulo: string;
  valorCentavos: number;
  externalReference: string;
  /** Para onde o comprador volta (sucesso, pendente e falha) — nunca localhost. */
  backUrl: string;
  /** Onde o Mercado Pago avisa do pagamento (HTTPS público). */
  notificationUrl: string;
}

export interface PreferenciaCriada {
  id: string;
  initPoint: string;
}

/**
 * Cria um pagamento avulso (Checkout Pro). O comprador paga por Pix ou cartão
 * como convidado, sem precisar de conta no Mercado Pago.
 */
export async function criarPreferencia(
  input: CriarPreferenciaInput,
  fetchFn: typeof fetch = fetch,
): Promise<PreferenciaCriada> {
  const resp = await fetchFn(`${mpApi()}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          id: 'mensalidade',
          title: input.titulo,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: input.valorCentavos / 100,
        },
      ],
      external_reference: input.externalReference,
      back_urls: { success: input.backUrl, pending: input.backUrl, failure: input.backUrl },
      auto_return: 'approved',
      notification_url: input.notificationUrl,
    }),
  });
  if (!resp.ok) throw await erroDoMp(resp);
  const j = (await resp.json()) as { id: string; init_point: string };
  return { id: j.id, initPoint: j.init_point };
}
