import { describe, it, expect } from 'vitest';
import {
  consultarAssinaturaDetalhada,
  consultarContaDetalhada,
  consultarPagamentoDetalhado,
} from './mercadopago-diagnostico.js';

function resposta(corpo: unknown, status = 200): typeof fetch {
  return (async () =>
    ({ ok: status < 400, status, json: async () => corpo }) as Response) as unknown as typeof fetch;
}

describe('mercadopago-diagnostico', () => {
  it('conta: lê id, e-mail, site e se é de teste', async () => {
    const c = await consultarContaDetalhada(
      'tok',
      resposta({ id: 123, nickname: 'LOJA', email: 'a@b.com', site_id: 'MLB', tags: ['normal'] }),
    );
    expect(c).toEqual({ id: '123', nickname: 'LOJA', email: 'a@b.com', siteId: 'MLB', ehTeste: false });
    const t = await consultarContaDetalhada('tok', resposta({ id: 1, tags: ['test_user'] }));
    expect(t.ehTeste).toBe(true);
  });

  it('assinatura: lê pagador, vendedor, valor e status', async () => {
    const a = await consultarAssinaturaDetalhada(
      'tok',
      'pre_1',
      resposta({
        id: 'pre_1',
        status: 'pending',
        payer_id: 999,
        payer_email: 'p@x.com',
        collector_id: 123,
        reason: 'Mensalidade',
        auto_recurring: { transaction_amount: 5 },
        date_created: '2026-10-19T10:00:00.000-03:00',
      }),
    );
    expect(a).toMatchObject({ status: 'pending', payerId: '999', payerEmail: 'p@x.com', collectorId: '123', valor: 5 });
  });

  it('pagamento: lê status, motivo da recusa e pagador', async () => {
    const p = await consultarPagamentoDetalhado(
      'tok',
      '184064324217',
      resposta({
        id: 184064324217,
        status: 'rejected',
        status_detail: 'cc_rejected_high_risk',
        payment_method_id: 'master',
        transaction_amount: 5,
        payer: { id: 55, email: 'p@x.com' },
      }),
    );
    expect(p).toMatchObject({ status: 'rejected', statusDetail: 'cc_rejected_high_risk', payerId: '55', meio: 'master', valor: 5 });
  });

  it('erro do Mercado Pago vira exceção com o status HTTP', async () => {
    await expect(
      consultarPagamentoDetalhado('tok', '1', resposta({ message: 'Payment not found' }, 404)),
    ).rejects.toMatchObject({ status: 404, message: 'Payment not found' });
  });
});
