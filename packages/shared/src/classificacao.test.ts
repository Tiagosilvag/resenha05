import { describe, it, expect } from 'vitest';
import { calcularClassificacao } from './classificacao.js';

const times = [
  { id: 'a', nome: 'Time A', grupo: null },
  { id: 'b', nome: 'Time B', grupo: null },
  { id: 'c', nome: 'Time C', grupo: null },
];

describe('calcularClassificacao', () => {
  it('conta pontos, saldo e ordena', () => {
    const jogos = [
      { timeAId: 'a', timeBId: 'b', placarA: 2, placarB: 0, status: 'encerrado' },
      { timeAId: 'b', timeBId: 'c', placarA: 1, placarB: 1, status: 'encerrado' },
      { timeAId: 'a', timeBId: 'c', placarA: 3, placarB: 1, status: 'encerrado' },
    ];
    const tab = calcularClassificacao(times, jogos);
    expect(tab[0]!.timeId).toBe('a');
    expect(tab[0]!.pontos).toBe(6);
    expect(tab[0]!.saldo).toBe(4);
    expect(tab.find((l) => l.timeId === 'b')!.pontos).toBe(1);
    expect(tab.find((l) => l.timeId === 'c')!.pontos).toBe(1);
    // desempate por saldo: C (0) acima de B (-2)
    expect(tab[1]!.timeId).toBe('c');
  });

  it('ignora jogos não encerrados', () => {
    const jogos = [
      { timeAId: 'a', timeBId: 'b', placarA: 5, placarB: 0, status: 'agendado' },
    ];
    const tab = calcularClassificacao(times, jogos);
    expect(tab.every((l) => l.jogos === 0)).toBe(true);
  });
});
