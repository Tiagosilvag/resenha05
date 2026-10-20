import { describe, it, expect } from 'vitest';
import { criarPreferencia } from './mercadopago-preferencia.js';

describe('criarPreferencia', () => {
  it('envia valor em reais, referência, retorno e aviso; devolve o link de pagamento', async () => {
    let corpo: any;
    let url = '';
    const fake = (async (u: string, init: RequestInit) => {
      url = u;
      corpo = JSON.parse(String(init.body));
      return { ok: true, status: 201, json: async () => ({ id: 'pref_1', init_point: 'https://mp/checkout?pref_id=pref_1' }) };
    }) as unknown as typeof fetch;

    const r = await criarPreferencia(
      {
        accessToken: 'tok',
        titulo: 'Mensalidade 10/2026',
        valorCentavos: 4990,
        externalReference: 'avulso:abc',
        backUrl: 'https://app/org/1/assinatura',
        notificationUrl: 'https://app/api/webhooks/mercadopago/assinatura',
      },
      fake,
    );
    expect(r).toEqual({ id: 'pref_1', initPoint: 'https://mp/checkout?pref_id=pref_1' });
    expect(url.endsWith('/checkout/preferences')).toBe(true);
    expect(corpo.items[0]).toMatchObject({ quantity: 1, currency_id: 'BRL', unit_price: 49.9 });
    expect(corpo.external_reference).toBe('avulso:abc');
    expect(corpo.back_urls.success).toBe('https://app/org/1/assinatura');
    expect(corpo.auto_return).toBe('approved');
    expect(corpo.notification_url).toBe('https://app/api/webhooks/mercadopago/assinatura');
  });

  it('erro do Mercado Pago vira exceção com o status', async () => {
    const fake = (async () => ({ ok: false, status: 400, json: async () => ({ message: 'invalid_back_urls' }) })) as unknown as typeof fetch;
    await expect(
      criarPreferencia(
        { accessToken: 't', titulo: 'x', valorCentavos: 100, externalReference: 'r', backUrl: 'u', notificationUrl: 'n' },
        fake,
      ),
    ).rejects.toMatchObject({ status: 400, message: 'invalid_back_urls' });
  });
});
