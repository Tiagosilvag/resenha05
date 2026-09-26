import { describe, it, expect } from 'vitest';
import { organizacaoLiberada, interpretarStatusPreapproval } from './assinatura.js';

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
