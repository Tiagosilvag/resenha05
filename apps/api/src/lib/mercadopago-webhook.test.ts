import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verificarAssinaturaWebhook } from './mercadopago-webhook.js';

function assinar(secret: string, dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verificarAssinaturaWebhook', () => {
  it('aceita uma assinatura válida', () => {
    const xSignature = assinar('segredo-123', 'pre_1', 'req-1', '1700000000');
    expect(
      verificarAssinaturaWebhook({
        secret: 'segredo-123',
        dataId: 'pre_1',
        xRequestId: 'req-1',
        xSignature,
      }),
    ).toBe(true);
  });

  it('recusa assinatura com segredo errado', () => {
    const xSignature = assinar('segredo-errado', 'pre_1', 'req-1', '1700000000');
    expect(
      verificarAssinaturaWebhook({
        secret: 'segredo-123',
        dataId: 'pre_1',
        xRequestId: 'req-1',
        xSignature,
      }),
    ).toBe(false);
  });

  it('recusa header ausente ou mal formado', () => {
    expect(
      verificarAssinaturaWebhook({ secret: 'segredo-123', dataId: 'pre_1', xRequestId: 'req-1', xSignature: '' }),
    ).toBe(false);
    expect(
      verificarAssinaturaWebhook({
        secret: 'segredo-123',
        dataId: 'pre_1',
        xRequestId: 'req-1',
        xSignature: 'lixo-sem-formato',
      }),
    ).toBe(false);
  });
});
