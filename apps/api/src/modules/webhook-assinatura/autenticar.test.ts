import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { autenticarWebhook } from './autenticar.js';

function assinar(secret: string, dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('autenticarWebhook', () => {
  it("devolve 'nao_configurado' sem consultar a assinatura quando o segredo não existe", async () => {
    const buscarSegredo = vi.fn().mockResolvedValue(null);
    const resultado = await autenticarWebhook(
      { dataId: 'pre_1', xRequestId: 'req-1', xSignature: 'ts=1,v1=' + 'a'.repeat(64) },
      { buscarSegredo },
    );
    expect(resultado).toBe('nao_configurado');
  });

  it("devolve 'valido' quando a assinatura bate com o segredo cadastrado", async () => {
    const xSignature = assinar('segredo-do-painel', 'pre_1', 'req-1', '1700000000');
    const buscarSegredo = vi.fn().mockResolvedValue('segredo-do-painel');
    const resultado = await autenticarWebhook(
      { dataId: 'pre_1', xRequestId: 'req-1', xSignature },
      { buscarSegredo },
    );
    expect(resultado).toBe('valido');
  });

  it("devolve 'invalido' quando a assinatura não bate com o segredo cadastrado", async () => {
    const xSignature = assinar('segredo-errado', 'pre_1', 'req-1', '1700000000');
    const buscarSegredo = vi.fn().mockResolvedValue('segredo-do-painel');
    const resultado = await autenticarWebhook(
      { dataId: 'pre_1', xRequestId: 'req-1', xSignature },
      { buscarSegredo },
    );
    expect(resultado).toBe('invalido');
  });
});
