import { describe, it, expect, vi } from 'vitest';
import { criarPreapproval, buscarPreapproval, MercadoPagoErro } from './mercadopago-preapproval.js';

describe('criarPreapproval', () => {
  it('chama a API do MP e devolve id + link de checkout', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pre_123', init_point: 'https://mp.example/checkout/pre_123' }),
    });

    const resultado = await criarPreapproval(
      {
        accessToken: 'token-abc',
        reason: 'Mensalidade Resenha05 - Racha do Zé',
        externalReference: 'org-1:2026-10-01',
        payerEmail: 'dono@example.com',
        valorCentavos: 4990,
        backUrl: 'https://resenha05.coffetech.com.br/org/1/assinatura/retorno',
      },
      fetchFn as unknown as typeof fetch,
    );

    expect(resultado).toEqual({ id: 'pre_123', initPoint: 'https://mp.example/checkout/pre_123' });
    const [url, opcoes] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/preapproval');
    expect(opcoes.headers.Authorization).toBe('Bearer token-abc');
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.auto_recurring.transaction_amount).toBe(49.9);
    expect(corpo.auto_recurring.frequency_type).toBe('months');
  });

  it('lança erro claro quando o MP recusa', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'invalid access token' }),
    });
    await expect(
      criarPreapproval(
        {
          accessToken: 'token-invalido',
          reason: 'x',
          externalReference: 'x',
          payerEmail: 'x@x.com',
          valorCentavos: 100,
          backUrl: 'https://x.com',
        },
        fetchFn as unknown as typeof fetch,
      ),
    ).rejects.toThrow('invalid access token');
  });
});

describe('buscarPreapproval', () => {
  it('devolve o status e o valor atuais do preapproval', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pre_123',
        status: 'authorized',
        external_reference: 'org-1:2026-10-01',
        auto_recurring: { transaction_amount: 49.9 },
      }),
    });
    const detalhe = await buscarPreapproval('token-abc', 'pre_123', fetchFn as unknown as typeof fetch);
    expect(detalhe).toEqual({
      id: 'pre_123',
      status: 'authorized',
      externalReference: 'org-1:2026-10-01',
      valorCentavos: 4990,
    });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.mercadopago.com/preapproval/pre_123');
  });
});

describe('MercadoPagoErro', () => {
  it('buscarPreapproval expõe o status HTTP do MP no erro', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: 'preapproval not found' }),
    });
    const erro = await buscarPreapproval('t', 'pre_x', fetchFn as unknown as typeof fetch).catch((e) => e);
    expect(erro).toBeInstanceOf(MercadoPagoErro);
    expect(erro.status).toBe(404);
    expect(erro.message).toBe('preapproval not found');
  });
});
