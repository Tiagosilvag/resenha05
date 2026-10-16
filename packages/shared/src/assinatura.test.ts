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
