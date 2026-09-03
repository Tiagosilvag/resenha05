import { describe, it, expect } from 'vitest';
import { sortearTimes, amplitudeEstrelas, type JogadorSorteio } from './sorteio.js';

function gerar(dist: Record<number, number>): JogadorSorteio[] {
  const out: JogadorSorteio[] = [];
  let n = 0;
  for (const [estrelasStr, qtd] of Object.entries(dist)) {
    const estrelas = Number(estrelasStr);
    for (let i = 0; i < qtd; i++) {
      out.push({ profileId: `p${n}`, nome: `Jogador ${n}`, estrelas });
      n++;
    }
  }
  return out;
}

describe('sortearTimes', () => {
  it('mantém a amplitude de estrelas <= 1 com distribuição variada', () => {
    const jogadores = gerar({ 5: 3, 4: 5, 3: 8, 2: 4, 1: 2 }); // 22 jogadores
    for (const n of [2, 3, 4]) {
      const times = sortearTimes(jogadores, n, { seed: 42 });
      expect(amplitudeEstrelas(times)).toBeLessThanOrEqual(1);
    }
  });

  it('distribui todos os jogadores, sem repetir', () => {
    const jogadores = gerar({ 4: 10, 2: 10 });
    const times = sortearTimes(jogadores, 4, { seed: 7 });
    const ids = times.flatMap((t) => t.jogadores.map((j) => j.profileId));
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it('tamanhos dos times diferem no máximo em 1', () => {
    const jogadores = gerar({ 3: 23 });
    const times = sortearTimes(jogadores, 4, { seed: 1 });
    const tamanhos = times.map((t) => t.jogadores.length);
    expect(Math.max(...tamanhos) - Math.min(...tamanhos)).toBeLessThanOrEqual(1);
  });

  it('é reproduzível com a mesma semente', () => {
    const jogadores = gerar({ 5: 2, 3: 10, 1: 4 });
    const a = sortearTimes(jogadores, 3, { seed: 99 });
    const b = sortearTimes(jogadores, 3, { seed: 99 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rejeita nº de times fora de 2..32', () => {
    const jogadores = gerar({ 3: 10 });
    expect(() => sortearTimes(jogadores, 1)).toThrow();
    expect(() => sortearTimes(jogadores, 33)).toThrow();
  });

  it('rejeita menos jogadores que times', () => {
    expect(() => sortearTimes(gerar({ 3: 3 }), 4)).toThrow();
  });
});
