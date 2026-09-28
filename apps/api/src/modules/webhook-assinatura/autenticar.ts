import { verificarAssinaturaWebhook } from '../../lib/mercadopago-webhook.js';

export interface AutenticarWebhookInput {
  dataId: string;
  xRequestId: string;
  xSignature: string;
}

export type ResultadoAutenticacaoWebhook = 'valido' | 'invalido' | 'nao_configurado';

export interface DepsAutenticarWebhook {
  /** Segredo do webhook (já decifrado), ou null se a plataforma ainda não cadastrou um. */
  buscarSegredo(): Promise<string | null>;
}

/**
 * Confere o header x-signature do webhook contra o segredo cadastrado pelo
 * painel de admin (plataforma_config, cifrado — nunca env var). Separado da
 * rota para testar sem precisar de um Postgres de verdade.
 */
export async function autenticarWebhook(
  input: AutenticarWebhookInput,
  deps: DepsAutenticarWebhook,
): Promise<ResultadoAutenticacaoWebhook> {
  const secret = await deps.buscarSegredo();
  if (!secret) return 'nao_configurado';

  const valido = verificarAssinaturaWebhook({
    secret,
    dataId: input.dataId,
    xRequestId: input.xRequestId,
    xSignature: input.xSignature,
  });
  return valido ? 'valido' : 'invalido';
}
