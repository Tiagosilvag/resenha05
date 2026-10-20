import { describe, it, expect } from 'vitest';
import { crc16, gerarPixCopiaECola } from './pix.js';

/** Lê um código TLV (id de 2, tamanho de 2, valor) em um mapa. */
function ler(codigo: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < codigo.length) {
    const id = codigo.slice(i, i + 2);
    const tam = Number(codigo.slice(i + 2, i + 4));
    out[id] = codigo.slice(i + 4, i + 4 + tam);
    i += 4 + tam;
  }
  return out;
}

describe('crc16', () => {
  it('bate com o vetor padrão CCITT-FALSE ("123456789" → 29B1)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('gerarPixCopiaECola', () => {
  const codigo = gerarPixCopiaECola({ chave: 'dono@exemplo.com', favorecido: 'João da Silva', valor: 30 });
  const campos = ler(codigo);

  it('tem o formato do BR Code: começa com 000201 e termina com o CRC certo', () => {
    expect(codigo.startsWith('000201')).toBe(true);
    const semCrc = codigo.slice(0, -4);
    expect(semCrc.endsWith('6304')).toBe(true);
    expect(codigo.slice(-4)).toBe(crc16(semCrc));
  });

  it('leva a chave dentro da conta do Pix e o valor com duas casas', () => {
    const conta = ler(campos['26']!);
    expect(conta['00']).toBe('BR.GOV.BCB.PIX');
    expect(conta['01']).toBe('dono@exemplo.com');
    expect(campos['54']).toBe('30.00');
    expect(campos['53']).toBe('986');
    expect(campos['58']).toBe('BR');
  });

  it('o nome vai sem acento, em caixa alta e com no máximo 25 caracteres', () => {
    expect(campos['59']).toBe('JOAO DA SILVA');
    const longo = ler(gerarPixCopiaECola({ chave: 'x@y.com', favorecido: 'Maria Aparecida de Souza Albuquerque Neto' }));
    expect(longo['59']!.length).toBeLessThanOrEqual(25);
  });

  it('sem valor, não inclui o campo de valor (quem paga digita)', () => {
    const sem = ler(gerarPixCopiaECola({ chave: 'x@y.com', favorecido: 'Fulano' }));
    expect(sem['54']).toBeUndefined();
  });

  it('valor com centavos e identificador da cobrança', () => {
    const c = ler(gerarPixCopiaECola({ chave: '11999998888', favorecido: 'Racha', valor: 12.5, txid: 'pelada-123' }));
    expect(c['54']).toBe('12.50');
    expect(ler(c['62']!)['05']).toBe('pelada123');
  });

  it('todos os tamanhos declarados conferem (o código se lê de ponta a ponta)', () => {
    let i = 0;
    while (i < codigo.length) {
      const tam = Number(codigo.slice(i + 2, i + 4));
      expect(Number.isInteger(tam)).toBe(true);
      i += 4 + tam;
    }
    expect(i).toBe(codigo.length);
  });
});
