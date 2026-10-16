import { describe, it, expect } from 'vitest';
import {
  redistribuirPerdedor,
  resultadoDaPartida,
  atingiuLimiteDeGols,
  decorridoSegundos,
  tempoEsgotado,
  instanteDoFimPorTempo,
  sugerirProximaPartida,
  rankearSubstitutos,
  filaDeEspera,
  type TimeDaPartida,
} from './partida.js';

function time(id: string, estrelas: number[]): TimeDaPartida {
  return {
    id,
    jogadores: estrelas.map((e, i) => ({ profileId: `${id}-${i}`, estrelas: e })),
  };
}
const total = (t: { estrelas: number }[]) => t.reduce((s, j) => s + j.estrelas, 0);

describe('redistribuirPerdedor', () => {
  it('9 jogadores (4+4+1): o perdedor completa o time da sobra e deixa 1 de fora', () => {
    const vencedor = time('v', [3, 3, 3, 3]);
    const perdedor = time('p', [1, 2, 3, 5]);
    const sobra = time('s', [3]);
    const r = redistribuirPerdedor({ vencedor, perdedor, sobra, porTime: 4, seed: 1 });
    expect(r.sobraCompleta).toHaveLength(4);
    expect(r.ficamNoPerdedor).toHaveLength(1);
    expect(new Set([...r.sobraCompleta, ...r.ficamNoPerdedor]).size).toBe(5);
  });

  it('escolhe quem entra para o novo time ficar o mais perto possível do vencedor', () => {
    const vencedor = time('v', [4, 4, 4, 4]); // 16
    const perdedor = time('p', [1, 2, 3, 5]);
    const sobra = time('s', [3]);
    // Precisa de 3 do perdedor; a melhor soma possível é {5,3,2} = 10 (total 13).
    const r = redistribuirPerdedor({ vencedor, perdedor, sobra, porTime: 4, seed: 1 });
    expect(r.totalNovoTime).toBe(13);
    expect(r.ficamNoPerdedor).toEqual(['p-0']);
  });

  it('quando o jogador da sobra é forte, entram os mais fracos', () => {
    const vencedor = time('v', [3, 3, 3, 3]); // 12
    const perdedor = time('p', [1, 2, 4, 5]);
    const sobra = time('s', [5]);
    // alvo 12 - 5 = 7 -> {1,2,4}
    const r = redistribuirPerdedor({ vencedor, perdedor, sobra, porTime: 4, seed: 1 });
    expect(r.totalNovoTime).toBe(12);
    expect(r.ficamNoPerdedor).toEqual(['p-3']);
  });

  it('quando o jogador da sobra é fraco, entram os mais fortes', () => {
    const vencedor = time('v', [3, 3, 3, 3]); // 12
    const perdedor = time('p', [1, 2, 4, 5]);
    const sobra = time('s', [1]);
    // alvo 12 - 1 = 11 -> {2,4,5}
    const r = redistribuirPerdedor({ vencedor, perdedor, sobra, porTime: 4, seed: 1 });
    expect(r.totalNovoTime).toBe(12);
    expect(r.ficamNoPerdedor).toEqual(['p-0']);
  });

  it('não é "sempre os mais fracos": o conjunto todo decide', () => {
    const vencedor = time('v', [5, 5, 5, 5]); // 20
    const perdedor = time('p', [1, 2, 4, 5]);
    const sobra = time('s', [3]);
    // alvo 20 - 3 = 17 com 3 jogadores: {2,4,5}=11 é o mais perto (os mais fracos dariam 7)
    const r = redistribuirPerdedor({ vencedor, perdedor, sobra, porTime: 4, seed: 1 });
    expect(r.novosNaSobra.sort()).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('sobra com 2 jogadores (5 por time): entram 3 do perdedor e ficam 2', () => {
    const vencedor = time('v', [3, 3, 3, 3, 3]);
    const perdedor = time('p', [2, 2, 3, 4, 4]);
    const sobra = time('s', [3, 3]);
    const r = redistribuirPerdedor({ vencedor, perdedor, sobra, porTime: 5, seed: 1 });
    expect(r.sobraCompleta).toHaveLength(5);
    expect(r.ficamNoPerdedor).toHaveLength(2);
    expect(r.novosNaSobra).toHaveLength(3);
  });

  it('funciona para 10 a 13 jogadores (times de 4 ou 5 com sobra de 2 a 3)', () => {
    for (const [porTime, sobraTam] of [[4, 2], [4, 3], [5, 3], [5, 1]] as const) {
      const sobra = time('s', new Array(sobraTam).fill(3));
      const r = redistribuirPerdedor({
        vencedor: time('v', new Array(porTime).fill(3)),
        perdedor: time('p', [1, 2, 3, 4, 5].slice(0, porTime)),
        sobra,
        porTime,
        seed: 7,
      });
      expect(r.sobraCompleta).toHaveLength(porTime);
      expect(r.ficamNoPerdedor).toHaveLength(sobraTam);
    }
  });

  it('com várias escolhas igualmente equilibradas, o sorteio varia e é reproduzível com a semente', () => {
    const args = {
      vencedor: time('v', [3, 3, 3, 3]),
      perdedor: time('p', [3, 3, 3, 3]),
      sobra: time('s', [3]),
      porTime: 4,
    };
    const iguais = redistribuirPerdedor({ ...args, seed: 5 });
    expect(redistribuirPerdedor({ ...args, seed: 5 })).toEqual(iguais);
    const quemFica = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      quemFica.add(redistribuirPerdedor({ ...args, seed }).ficamNoPerdedor.join());
    }
    expect(quemFica.size).toBeGreaterThan(1);
  });

  it('recusa quando a sobra já está completa', () => {
    expect(() =>
      redistribuirPerdedor({
        vencedor: time('v', [3, 3]),
        perdedor: time('p', [3, 3]),
        sobra: time('s', [3, 3]),
        porTime: 2,
      }),
    ).toThrow(/completo/);
  });

  it('recusa quando o perdedor não tem jogadores suficientes', () => {
    expect(() =>
      redistribuirPerdedor({
        vencedor: time('v', [3, 3, 3, 3]),
        perdedor: time('p', [3, 3]),
        sobra: time('s', [3]),
        porTime: 4,
      }),
    ).toThrow(/jogadores/);
  });

  it('o total do novo time bate com as estrelas dos escolhidos', () => {
    const vencedor = time('v', [2, 3, 4, 5]);
    const perdedor = time('p', [1, 5, 3, 2]);
    const sobra = time('s', [4]);
    const r = redistribuirPerdedor({ vencedor, perdedor, sobra, porTime: 4, seed: 3 });
    const escolhidos = perdedor.jogadores.filter((j) => r.novosNaSobra.includes(j.profileId));
    expect(r.totalNovoTime).toBe(total(sobra.jogadores) + total(escolhidos));
  });
});

describe('resultadoDaPartida', () => {
  it('quem fez mais gols vence; igual é empate', () => {
    expect(resultadoDaPartida(2, 1)).toBe('a');
    expect(resultadoDaPartida(1, 3)).toBe('b');
    expect(resultadoDaPartida(2, 2)).toBe('empate');
    expect(resultadoDaPartida(0, 0)).toBe('empate');
  });
});

describe('atingiuLimiteDeGols', () => {
  it('encerra quando um dos times chega ao limite', () => {
    expect(atingiuLimiteDeGols(2, 1, 2)).toBe('a');
    expect(atingiuLimiteDeGols(1, 3, 3)).toBe('b');
  });
  it('não encerra antes do limite nem sem limite', () => {
    expect(atingiuLimiteDeGols(1, 1, 2)).toBeNull();
    expect(atingiuLimiteDeGols(5, 0, null)).toBeNull();
  });
});

describe('cronômetro', () => {
  const t0 = new Date('2026-10-17T20:00:00Z');
  it('soma o acumulado com o trecho que está rodando', () => {
    expect(decorridoSegundos({ acumuladoSeg: 30, retomadoEm: new Date(t0.getTime() - 20_000) }, t0)).toBe(50);
  });
  it('pausado (sem retomadoEm) só vale o acumulado', () => {
    expect(decorridoSegundos({ acumuladoSeg: 75, retomadoEm: null }, t0)).toBe(75);
  });
  it('nunca fica negativo se o relógio voltar', () => {
    expect(decorridoSegundos({ acumuladoSeg: 0, retomadoEm: new Date(t0.getTime() + 5_000) }, t0)).toBe(0);
  });
  it('tempo esgotado só existe com duração configurada', () => {
    expect(tempoEsgotado(600, 10)).toBe(true);
    expect(tempoEsgotado(599, 10)).toBe(false);
    expect(tempoEsgotado(9999, null)).toBe(false);
  });
  it('o instante do fim por tempo considera o que já tinha corrido antes', () => {
    const retomado = new Date('2026-10-17T20:00:00Z');
    const fim = instanteDoFimPorTempo({ acumuladoSeg: 240, retomadoEm: retomado }, 10);
    expect(fim.toISOString()).toBe('2026-10-17T20:06:00.000Z');
  });
});

describe('sugerirProximaPartida', () => {
  const times = [
    { id: 'A', numero: 1, jogadores: 4 },
    { id: 'B', numero: 2, jogadores: 4 },
    { id: 'C', numero: 3, jogadores: 1 },
  ];

  it('a primeira partida é entre os dois primeiros times completos', () => {
    expect(sugerirProximaPartida(times, [])).toEqual({ timeAId: 'A', timeBId: 'B' });
  });

  it('o time incompleto não é sugerido antes de ser completado', () => {
    expect(sugerirProximaPartida(times, [{ timeAId: 'A', timeBId: 'B', vencedorId: 'A' }])).toEqual({
      timeAId: 'A',
      timeBId: 'B',
    });
  });

  it('depois da redistribuição o antigo time da sobra (agora completo) enfrenta o vencedor', () => {
    const depois = [
      { id: 'A', numero: 1, jogadores: 4 },
      { id: 'B', numero: 2, jogadores: 1 },
      { id: 'C', numero: 3, jogadores: 4 },
    ];
    expect(sugerirProximaPartida(depois, [{ timeAId: 'A', timeBId: 'B', vencedorId: 'A' }])).toEqual({
      timeAId: 'A',
      timeBId: 'C',
    });
  });

  it('com 4 times completos, quem espera há mais tempo entra', () => {
    const quatro = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, numero: i + 1, jogadores: 5 }));
    const jogadas = [
      { timeAId: 'A', timeBId: 'B', vencedorId: 'A' },
      { timeAId: 'A', timeBId: 'C', vencedorId: 'C' },
    ];
    // vencedor C fica; esperando: D (nunca jogou) antes de B (jogou na 1ª)
    expect(sugerirProximaPartida(quatro, jogadas)).toEqual({ timeAId: 'C', timeBId: 'D' });
  });

  it('empate sem perdedor: sugere os que esperam', () => {
    const quatro = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, numero: i + 1, jogadores: 5 }));
    expect(sugerirProximaPartida(quatro, [{ timeAId: 'A', timeBId: 'B', vencedorId: null }])).toEqual({
      timeAId: 'C',
      timeBId: 'D',
    });
  });

  it('com só dois times, é a revanche', () => {
    const dois = [
      { id: 'A', numero: 1, jogadores: 5 },
      { id: 'B', numero: 2, jogadores: 5 },
    ];
    expect(sugerirProximaPartida(dois, [{ timeAId: 'A', timeBId: 'B', vencedorId: 'B' }])).toEqual({
      timeAId: 'A',
      timeBId: 'B',
    });
  });
});

describe('rankearSubstitutos', () => {
  const jg = (id: string, estrelas: number) => ({ profileId: id, estrelas });

  it('com os times equilibrados, entra quem tem as estrelas de quem saiu', () => {
    const meuTime = [jg('a', 5), jg('b', 3), jg('c', 2), jg('d', 2)]; // 12
    const adversario = [jg('x', 3), jg('y', 3), jg('z', 3), jg('w', 3)]; // 12
    const r = rankearSubstitutos({
      saindo: jg('a', 5),
      meuTime,
      adversario,
      candidatos: [jg('c1', 2), jg('c2', 5), jg('c3', 4)],
    });
    expect(r[0]!.profileId).toBe('c2');
    expect(r[0]!.diferenca).toBe(0);
  });

  it('com o time mais forte que o adversário, o substituto mais fraco equilibra', () => {
    const meuTime = [jg('a', 5), jg('b', 4), jg('c', 4), jg('d', 3)]; // 16
    const adversario = [jg('x', 3), jg('y', 3), jg('z', 3), jg('w', 3)]; // 12
    const r = rankearSubstitutos({
      saindo: jg('a', 5),
      meuTime,
      adversario,
      candidatos: [jg('c1', 1), jg('c2', 5), jg('c3', 3)],
    });
    // sem o 5: 11; com 1 => 12 (exato)
    expect(r[0]!.profileId).toBe('c1');
  });

  it('o time mais fraco puxa o substituto mais forte', () => {
    const meuTime = [jg('a', 2), jg('b', 2), jg('c', 2), jg('d', 2)]; // 8
    const adversario = [jg('x', 4), jg('y', 4), jg('z', 4), jg('w', 4)]; // 16
    const r = rankearSubstitutos({
      saindo: jg('a', 2),
      meuTime,
      adversario,
      candidatos: [jg('c1', 1), jg('c2', 5), jg('c3', 3)],
    });
    expect(r.map((x) => x.profileId)).toEqual(['c2', 'c3', 'c1']);
  });

  it('no empate de equilíbrio, vence quem tem estrelas mais parecidas com as de quem saiu', () => {
    const meuTime = [jg('a', 3), jg('b', 3)];
    const adversario = [jg('x', 3), jg('y', 3)];
    // sem 'a': média do time com c = (3+e)/2; e=2 → 2.5 (dif .5); e=4 → 3.5 (dif .5)
    const r = rankearSubstitutos({
      saindo: jg('a', 3),
      meuTime,
      adversario,
      candidatos: [jg('forte', 5), jg('fraco', 1), jg('igual', 3)],
    });
    expect(r[0]!.profileId).toBe('igual');
  });

  it('funciona com times de tamanhos diferentes (compara médias)', () => {
    const meuTime = [jg('a', 3)]; // time incompleto
    const adversario = [jg('x', 4), jg('y', 4), jg('z', 4), jg('w', 4)];
    const r = rankearSubstitutos({
      saindo: jg('a', 3),
      meuTime,
      adversario,
      candidatos: [jg('c1', 2), jg('c2', 4)],
    });
    expect(r[0]!.profileId).toBe('c2');
    expect(r[0]!.mediaDoTime).toBe(4);
  });

  it('sem candidatos devolve lista vazia', () => {
    expect(
      rankearSubstitutos({ saindo: jg('a', 3), meuTime: [jg('a', 3)], adversario: [jg('x', 3)], candidatos: [] }),
    ).toEqual([]);
  });

  it('é determinístico', () => {
    const e = {
      saindo: jg('a', 3),
      meuTime: [jg('a', 3), jg('b', 3)],
      adversario: [jg('x', 3), jg('y', 3)],
      candidatos: [jg('c1', 2), jg('c2', 4), jg('c3', 2)],
    };
    expect(rankearSubstitutos(e)).toEqual(rankearSubstitutos(e));
  });
});

describe('filaDeEspera', () => {
  const t = (id: string, numero: number, jogadores: number) => ({ id, numero, jogadores });

  it('só os times fora da partida, na ordem de número se ninguém jogou', () => {
    const times = [t('A', 1, 5), t('B', 2, 5), t('C', 3, 5), t('D', 4, 5)];
    expect(filaDeEspera(times, [], ['A', 'B'])).toEqual(['C', 'D']);
  });

  it('quem esperou mais entra antes; quem acabou de jogar vai para o fim', () => {
    const times = [t('A', 1, 5), t('B', 2, 5), t('C', 3, 5), t('D', 4, 5)];
    const jogadas = [
      { timeAId: 'A', timeBId: 'B' },
      { timeAId: 'A', timeBId: 'C' },
    ];
    // em jogo A x D; B jogou na 1ª, C na 2ª
    expect(filaDeEspera(times, jogadas, ['A', 'D'])).toEqual(['B', 'C']);
  });

  it('time incompleto fica atrás dos completos', () => {
    const times = [t('A', 1, 4), t('B', 2, 4), t('C', 3, 1), t('D', 4, 4)];
    expect(filaDeEspera(times, [], ['A', 'B'])).toEqual(['D', 'C']);
  });

  it('com um só time esperando, ele é o próximo e o último', () => {
    const times = [t('A', 1, 4), t('B', 2, 4), t('C', 3, 1)];
    const fila = filaDeEspera(times, [], ['A', 'B']);
    expect(fila).toEqual(['C']);
    expect(fila[0]).toBe(fila[fila.length - 1]);
  });

  it('sem ninguém esperando, fila vazia', () => {
    expect(filaDeEspera([t('A', 1, 5), t('B', 2, 5)], [], ['A', 'B'])).toEqual([]);
  });
});
