import { describe, it, expect } from 'vitest';
import {
  organizacaoLiberada,
  interpretarStatusPreapproval,
  derivarStatusOrganizacao,
  podeIniciarCheckout,
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
