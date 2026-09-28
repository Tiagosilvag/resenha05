import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { rotasWebhookAssinatura } from './rotas.js';

async function montar() {
  const app = Fastify();
  await app.register(rotasWebhookAssinatura);
  return app;
}

describe('POST /webhooks/mercadopago/assinatura', () => {
  it('confirma com 200, sem processar, eventos que não são de preapproval', async () => {
    // Este caminho retorna antes de qualquer consulta ao banco — os demais
    // (autenticação e processamento) dependem de plataforma_config e são
    // cobertos em autenticar.test.ts e processar.test.ts, que testam a
    // lógica com dependências injetadas em vez de um Postgres de verdade.
    const app = await montar();
    const r = await app.inject({
      method: 'POST',
      url: '/webhooks/mercadopago/assinatura',
      payload: { type: 'payment', data: { id: '123' } },
    });
    expect(r.statusCode).toBe(200);
  });
});
