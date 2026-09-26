import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { rotasWebhookAssinatura } from './rotas.js';

async function montar() {
  const app = Fastify();
  await app.register(rotasWebhookAssinatura);
  return app;
}

const evento = { type: 'subscription_preapproval', data: { id: 'pre_falso' } };

describe('POST /webhooks/mercadopago/assinatura', () => {
  it('recusa com 401 quando a assinatura não bate', async () => {
    const app = await montar();
    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago/assinatura',
      headers: { 'x-signature': 'ts=1700000000,v1=' + 'a'.repeat(64), 'x-request-id': 'req-1' },
      payload: evento,
    });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ erro: 'Assinatura inválida.' });
  });

  it('recusa com 401 quando o header x-signature está ausente', async () => {
    const app = await montar();
    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago/assinatura',
      payload: evento,
    });
    expect(r.statusCode).toBe(401);
  });

  it('confirma com 200, sem processar, eventos que não são de preapproval', async () => {
    const app = await montar();
    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago/assinatura',
      payload: { type: 'payment', data: { id: '123' } },
    });
    expect(r.statusCode).toBe(200);
  });
});
