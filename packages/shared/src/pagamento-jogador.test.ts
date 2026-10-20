import { describe, it, expect } from 'vitest';
import {
  configurarPagamentoJogadoresSchema,
  decidirPagamentoJogador,
  idDaReferenciaJogador,
  referenciaDoPagamentoJogador,
  valorEmCentavos,
} from './pagamento-jogador.js';

describe('configurarPagamentoJogadoresSchema', () => {
  it('manual e mercadopago não pedem chave Pix', () => {
    expect(configurarPagamentoJogadoresSchema.safeParse({ modo: 'manual' }).success).toBe(true);
    expect(configurarPagamentoJogadoresSchema.safeParse({ modo: 'mercadopago' }).success).toBe(true);
  });
  it('pix exige a chave', () => {
    expect(configurarPagamentoJogadoresSchema.safeParse({ modo: 'pix' }).success).toBe(false);
    expect(configurarPagamentoJogadoresSchema.safeParse({ modo: 'pix', pixChave: '   ' }).success).toBe(false);
    const ok = configurarPagamentoJogadoresSchema.safeParse({ modo: 'pix', pixChave: ' dono@x.com ' });
    expect(ok.success && ok.data.pixChave).toBe('dono@x.com');
  });
  it('recusa modo desconhecido', () => {
    expect(configurarPagamentoJogadoresSchema.safeParse({ modo: 'cripto' }).success).toBe(false);
  });
});

describe('valorEmCentavos', () => {
  it('converte texto e número; grátis vira null', () => {
    expect(valorEmCentavos('30.00')).toBe(3000);
    expect(valorEmCentavos('12,5')).toBe(1250);
    expect(valorEmCentavos(7.9)).toBe(790);
    expect(valorEmCentavos('0.00')).toBeNull();
    expect(valorEmCentavos(null)).toBeNull();
    expect(valorEmCentavos('abc')).toBeNull();
  });
});

describe('referência do pagamento do jogador', () => {
  const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  it('vai e volta', () => {
    expect(idDaReferenciaJogador(referenciaDoPagamentoJogador(id))).toBe(id);
    expect(idDaReferenciaJogador('avulso:' + id)).toBeNull();
    expect(idDaReferenciaJogador(undefined)).toBeNull();
  });
});

describe('decidirPagamentoJogador', () => {
  const linha = { valorCentavos: 3000, status: 'pendente', peladaId: 'p1', profileId: 'j1' };
  const aprovado = { status: 'approved', valor: 30 };

  it('aprovado, valor certo, cobrança pendente: aplica', () => {
    expect(decidirPagamentoJogador({ pagamento: aprovado, linha })).toBe('aplicar');
  });
  it('valor menor que o cobrado não vale', () => {
    expect(decidirPagamentoJogador({ pagamento: { ...aprovado, valor: 29.9 }, linha })).toBe('valor_insuficiente');
  });
  it('pendente ou recusado não vale', () => {
    expect(decidirPagamentoJogador({ pagamento: { status: 'pending', valor: 30 }, linha })).toBe('nao_aprovado');
    expect(decidirPagamentoJogador({ pagamento: { status: 'rejected', valor: 30 }, linha })).toBe('nao_aprovado');
  });
  it('sem cobrança nossa correspondente, ignora', () => {
    expect(decidirPagamentoJogador({ pagamento: aprovado, linha: null })).toBe('desconhecido');
  });
  it('notificação repetida não aplica de novo', () => {
    expect(decidirPagamentoJogador({ pagamento: aprovado, linha: { ...linha, status: 'aprovado' } })).toBe('ja_aplicado');
  });
  it('pagamento de outro jogador ou de outra pelada não vale para este', () => {
    expect(decidirPagamentoJogador({ pagamento: aprovado, linha, esperado: { peladaId: 'p1', profileId: 'j2' } })).toBe('outro_jogador');
    expect(decidirPagamentoJogador({ pagamento: aprovado, linha, esperado: { peladaId: 'p2', profileId: 'j1' } })).toBe('outro_jogador');
    expect(decidirPagamentoJogador({ pagamento: aprovado, linha, esperado: { peladaId: 'p1', profileId: 'j1' } })).toBe('aplicar');
  });
});
