import { describe, it, expect } from 'vitest';
import { primeiroDiaDoMesUtc } from './periodo.js';

describe('primeiroDiaDoMesUtc', () => {
  it('devolve o dia 1 do mês (UTC) no formato YYYY-MM-DD', () => {
    expect(primeiroDiaDoMesUtc(new Date('2026-10-17T12:00:00Z'))).toBe('2026-10-01');
  });

  it('não escorrega de mês perto da virada, qualquer que seja o fuso do servidor', () => {
    expect(primeiroDiaDoMesUtc(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10-01');
    expect(primeiroDiaDoMesUtc(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-01');
  });
});
