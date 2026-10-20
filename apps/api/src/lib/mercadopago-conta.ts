import { mpApi } from './mercadopago-base.js';
import { erroDoMp } from './mercadopago-preapproval.js';

export interface ContaMp {
  nickname: string | null;
  siteId: string | null;
  /** Conta de teste do Mercado Pago (etiqueta `test_user`). */
  ehTeste: boolean;
}

/**
 * Consulta a conta dona do Access Token. Serve para validar o token na hora de
 * salvar (401 = o MP não o aceita) e saber se é conta de teste ou real.
 */
export async function consultarConta(accessToken: string, fetchFn: typeof fetch = fetch): Promise<ContaMp> {
  const resp = await fetchFn(`${mpApi()}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw await erroDoMp(resp);
  const j = (await resp.json()) as { nickname?: string; site_id?: string; tags?: string[] };
  return {
    nickname: j.nickname ?? null,
    siteId: j.site_id ?? null,
    ehTeste: Array.isArray(j.tags) && j.tags.includes('test_user'),
  };
}
