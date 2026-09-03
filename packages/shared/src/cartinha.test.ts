import { describe, it, expect } from 'vitest';
import { calcularAtributos, ATRIBUTOS } from './cartinha.js';

describe('calcularAtributos', () => {
  it('é determinístico', () => {
    const a = calcularAtributos({ profileId: 'abc', estrelas: 4, posicao: 'atacante' });
    const b = calcularAtributos({ profileId: 'abc', estrelas: 4, posicao: 'atacante' });
    expect(a).toEqual(b);
  });

  it('mais estrelas → overall maior', () => {
    const baixo = calcularAtributos({ profileId: 'x', estrelas: 1, posicao: 'meio' });
    const alto = calcularAtributos({ profileId: 'x', estrelas: 5, posicao: 'meio' });
    expect(alto.overall).toBeGreaterThan(baixo.overall + 15);
  });

  it('atacante tem TIR > DEF; zagueiro o contrário', () => {
    const ata = calcularAtributos({ profileId: 'p1', estrelas: 3, posicao: 'atacante' });
    const zag = calcularAtributos({ profileId: 'p1', estrelas: 3, posicao: 'zagueiro' });
    expect(ata.tir).toBeGreaterThan(ata.def);
    expect(zag.def).toBeGreaterThan(zag.tir);
  });

  it('todos os atributos ficam em 30..99', () => {
    for (const est of [1, 3, 5]) {
      const r = calcularAtributos({ profileId: 'seed' + est, estrelas: est, posicao: 'lateral' });
      for (const a of ATRIBUTOS) expect(r[a]).toBeGreaterThanOrEqual(30);
      for (const a of ATRIBUTOS) expect(r[a]).toBeLessThanOrEqual(99);
    }
  });

  it('gols melhoram o TIR', () => {
    const sem = calcularAtributos({ profileId: 'q', estrelas: 3, posicao: 'atacante' });
    const com = calcularAtributos({
      profileId: 'q',
      estrelas: 3,
      posicao: 'atacante',
      desempenho: { jogos: 5, gols: 8 },
    });
    expect(com.tir).toBeGreaterThan(sem.tir);
  });
});
