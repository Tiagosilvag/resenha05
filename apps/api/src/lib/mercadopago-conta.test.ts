import { describe, it, expect, vi } from 'vitest';
import { consultarConta } from './mercadopago-conta.js';
import { MercadoPagoErro } from './mercadopago-preapproval.js';

function respostaOk(corpo: unknown) {
  return { ok: true, status: 200, json: async () => corpo };
}

describe('consultarConta', () => {
  it('reconhece conta de teste pela etiqueta test_user', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      respostaOk({ nickname: 'TESTUSER123', site_id: 'MLB', tags: ['user_product_seller', 'test_user', 'normal'] }),
    );
    const conta = await consultarConta('token-abc', fetchFn as unknown as typeof fetch);
    expect(conta).toEqual({ nickname: 'TESTUSER123', siteId: 'MLB', ehTeste: true });

    const [url, opcoes] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/users/me');
    expect(opcoes.headers.Authorization).toBe('Bearer token-abc');
  });

  it('conta sem a etiqueta test_user é real', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      respostaOk({ nickname: 'LOJA', site_id: 'MLB', tags: ['normal'] }),
    );
    const conta = await consultarConta('token-abc', fetchFn as unknown as typeof fetch);
    expect(conta.ehTeste).toBe(false);
  });

  it('tolera resposta sem tags', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respostaOk({ nickname: 'X', site_id: 'MLB' }));
    const conta = await consultarConta('token-abc', fetchFn as unknown as typeof fetch);
    expect(conta.ehTeste).toBe(false);
  });

  it('lança MercadoPagoErro com o status quando o MP recusa o token', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'invalid access token' }),
    });
    const erro = await consultarConta('ruim', fetchFn as unknown as typeof fetch).catch((e) => e);
    expect(erro).toBeInstanceOf(MercadoPagoErro);
    expect(erro.status).toBe(401);
  });
});
