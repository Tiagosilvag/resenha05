import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerificarAssinaturaInput {
  secret: string;
  dataId: string;
  xRequestId: string;
  xSignature: string;
}

/**
 * Valida o header x-signature do webhook de assinaturas do Mercado Pago.
 * Formato: "ts=<timestamp>,v1=<hmac-sha256 hex>", HMAC sobre
 * "id:<dataId>;request-id:<xRequestId>;ts:<ts>;" (doc pública do MP).
 */
export function verificarAssinaturaWebhook(input: VerificarAssinaturaInput): boolean {
  const partes = Object.fromEntries(
    input.xSignature.split(',').map((p) => p.trim().split('=') as [string, string]),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${input.dataId};request-id:${input.xRequestId};ts:${ts};`;
  const esperado = createHmac('sha256', input.secret).update(manifest).digest('hex');

  const a = Buffer.from(v1, 'hex');
  const b = Buffer.from(esperado, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
