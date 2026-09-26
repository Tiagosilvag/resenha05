import { describe, it, expect } from 'vitest';
import { exigirOrganizacaoLiberada, traduzirErroCobranca } from './assinatura.js';
import { MercadoPagoErro } from './mercadopago-preapproval.js';
import { erro } from './erros.js';

describe('exigirOrganizacaoLiberada', () => {
  it('não lança para organização ativa', () => {
    expect(() => exigirOrganizacaoLiberada('ativa')).not.toThrow();
  });

  it.each(['trial', 'inadimplente', 'cancelada'] as const)('lança 403 para %s', (status) => {
    expect.assertions(2);
    try {
      exigirOrganizacaoLiberada(status);
    } catch (e) {
      expect((e as { status: number }).status).toBe(403);
      expect((e as Error).message).toBe('Esta organização está com a mensalidade pendente.');
    }
  });
});

describe('traduzirErroCobranca', () => {
  it('erro do MP vira 422 com mensagem genérica, sem vazar o texto do MP', () => {
    const t = traduzirErroCobranca(new MercadoPagoErro('invalid access token', 401));
    expect((t as { status: number }).status).toBe(422);
    expect(t.message).not.toContain('invalid access token');
    expect(t.message).toContain('mensalidade');
  });

  it('erro de aplicação passa como está', () => {
    const original = erro.proibido('x');
    expect(traduzirErroCobranca(original)).toBe(original);
  });

  it('erro inesperado também vira 422 genérico', () => {
    expect((traduzirErroCobranca(new Error('boom')) as { status: number }).status).toBe(422);
  });
});
