import { describe, it, expect } from 'vitest';
import {
  organizacaoLiberada,
  interpretarStatusPreapproval,
  derivarStatusOrganizacao,
  podeIniciarCheckout,
  idLiberacaoManual,
  ehLiberacaoManual,
  fimDoMes,
  proximoMesALiberar,
  MESES_MAX_ADIANTE,
  idPagamentoAvulso,
  ehPeriodoLimitado,
  referenciaDoPagamentoAvulso,
  chaveDaReferenciaAvulsa,
  decidirPagamentoAvulso,
} from './assinatura.js';

describe('organizacaoLiberada', () => {
  it('libera só quando ativa', () => {
    expect(organizacaoLiberada('ativa')).toBe(true);
    expect(organizacaoLiberada('trial')).toBe(false);
    expect(organizacaoLiberada('inadimplente')).toBe(false);
    expect(organizacaoLiberada('cancelada')).toBe(false);
  });
});

describe('interpretarStatusPreapproval', () => {
  it('authorized vira ativa/aprovado', () => {
    expect(interpretarStatusPreapproval('authorized')).toEqual({
      statusAssinatura: 'ativa',
      statusCiclo: 'aprovado',
    });
  });

  it('pending e paused viram inadimplente/atrasado', () => {
    expect(interpretarStatusPreapproval('pending')).toEqual({
      statusAssinatura: 'inadimplente',
      statusCiclo: 'atrasado',
    });
    expect(interpretarStatusPreapproval('paused')).toEqual({
      statusAssinatura: 'inadimplente',
      statusCiclo: 'atrasado',
    });
  });

  it('cancelled vira cancelada/cancelado', () => {
    expect(interpretarStatusPreapproval('cancelled')).toEqual({
      statusAssinatura: 'cancelada',
      statusCiclo: 'cancelado',
    });
  });
});

describe('derivarStatusOrganizacao', () => {
  it('usa o status do evento quando nenhum ciclo da organização está aprovado', () => {
    expect(derivarStatusOrganizacao('inadimplente', ['atrasado', 'pendente'])).toBe('inadimplente');
    expect(derivarStatusOrganizacao('cancelada', ['cancelado'])).toBe('cancelada');
  });

  it('mantém ativa se outra assinatura da organização está aprovada (evento de assinatura abandonada)', () => {
    expect(derivarStatusOrganizacao('inadimplente', ['aprovado', 'atrasado'])).toBe('ativa');
  });

  it('mantém ativa se a assinatura antiga foi cancelada mas a nova está aprovada', () => {
    expect(derivarStatusOrganizacao('cancelada', ['cancelado', 'aprovado'])).toBe('ativa');
  });
});

describe('podeIniciarCheckout', () => {
  it('só quem não está ativa inicia checkout', () => {
    expect(podeIniciarCheckout('ativa')).toBe(false);
    expect(podeIniciarCheckout('trial')).toBe(true);
    expect(podeIniciarCheckout('inadimplente')).toBe(true);
    expect(podeIniciarCheckout('cancelada')).toBe(true);
  });
});

describe('liberação manual da mensalidade', () => {
  it('o id da liberação é marcado como manual e por organização', () => {
    const id = idLiberacaoManual('org-1');
    expect(ehLiberacaoManual(id)).toBe(true);
    expect(id).not.toBe(idLiberacaoManual('org-2'));
    expect(ehLiberacaoManual('2c93808472')).toBe(false);
  });

  it('fimDoMes devolve o último dia do mês do período', () => {
    expect(fimDoMes('2026-10-01')).toBe('2026-10-31');
    expect(fimDoMes('2026-11-01')).toBe('2026-11-30');
    expect(fimDoMes('2026-02-01')).toBe('2026-02-28');
    expect(fimDoMes('2028-02-01')).toBe('2028-02-29');
    expect(fimDoMes('2026-12-01')).toBe('2026-12-31');
  });

  describe('proximoMesALiberar', () => {
    const hoje = new Date('2026-10-16T12:00:00Z');

    it('sem liberação anterior, é o mês atual', () => {
      expect(proximoMesALiberar(null, hoje)).toBe('2026-10-01');
    });

    it('com o mês atual já liberado, é o seguinte', () => {
      expect(proximoMesALiberar('2026-10-01', hoje)).toBe('2026-11-01');
    });

    it('com liberação antiga e vencida, volta para o mês atual', () => {
      expect(proximoMesALiberar('2026-08-01', hoje)).toBe('2026-10-01');
    });

    it('vira o ano', () => {
      expect(proximoMesALiberar('2026-12-01', new Date('2026-12-05T12:00:00Z'))).toBe('2027-01-01');
    });

    it('usa o mês de Brasília, não o de UTC, na virada do mês', () => {
      // 01/11 01:00 UTC ainda é 31/10 22:00 em Brasília.
      expect(proximoMesALiberar(null, new Date('2026-11-01T01:00:00Z'))).toBe('2026-10-01');
    });

    it('recusa liberar além do limite de meses adiante', () => {
      let ultimo: string | null = null;
      for (let i = 0; i < MESES_MAX_ADIANTE; i++) ultimo = proximoMesALiberar(ultimo, hoje);
      expect(() => proximoMesALiberar(ultimo, hoje)).toThrow(/meses/);
    });
  });
});

describe('pagamento avulso', () => {
  const chave = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it('o id marca a linha como período limitado, igual à liberação manual', () => {
    expect(ehPeriodoLimitado(idPagamentoAvulso(chave))).toBe(true);
    expect(ehPeriodoLimitado(idLiberacaoManual('org'))).toBe(true);
    expect(ehPeriodoLimitado('2c93808472')).toBe(false);
  });

  it('a referência enviada ao Mercado Pago volta para a chave', () => {
    expect(chaveDaReferenciaAvulsa(referenciaDoPagamentoAvulso(chave))).toBe(chave);
    expect(chaveDaReferenciaAvulsa('org:2026-10-01')).toBeNull();
    expect(chaveDaReferenciaAvulsa(null)).toBeNull();
  });

  describe('decidirPagamentoAvulso', () => {
    const linha = { organizacaoId: 'org-1', valorCentavos: 500, status: 'pendente' };
    const aprovado = { status: 'approved', valor: 5, externalReference: referenciaDoPagamentoAvulso(chave) };

    it('aprovado, valor certo, linha pendente: aplica', () => {
      expect(decidirPagamentoAvulso({ pagamento: aprovado, linha })).toBe('aplicar');
    });
    it('pagamento maior que o cobrado também vale', () => {
      expect(decidirPagamentoAvulso({ pagamento: { ...aprovado, valor: 10 }, linha })).toBe('aplicar');
    });
    it('valor menor que o cobrado não libera', () => {
      expect(decidirPagamentoAvulso({ pagamento: { ...aprovado, valor: 4.99 }, linha })).toBe('valor_insuficiente');
    });
    it('não aprovado (pendente, recusado) não libera', () => {
      expect(decidirPagamentoAvulso({ pagamento: { ...aprovado, status: 'pending' }, linha })).toBe('nao_aprovado');
      expect(decidirPagamentoAvulso({ pagamento: { ...aprovado, status: 'rejected' }, linha })).toBe('nao_aprovado');
    });
    it('sem linha nossa correspondente, ignora', () => {
      expect(decidirPagamentoAvulso({ pagamento: aprovado, linha: null })).toBe('desconhecido');
    });
    it('já aplicado não aplica de novo (notificação repetida)', () => {
      expect(decidirPagamentoAvulso({ pagamento: aprovado, linha: { ...linha, status: 'aprovado' } })).toBe('ja_aplicado');
    });
    it('pagamento de outra organização não vale para esta', () => {
      expect(decidirPagamentoAvulso({ pagamento: aprovado, linha, organizacaoEsperada: 'org-2' })).toBe('outra_organizacao');
    });
  });
});
