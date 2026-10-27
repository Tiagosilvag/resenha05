import { describe, it, expect } from 'vitest';
import {
  sortearTimes,
  amplitudeEstrelas,
  peladaExigePagamento,
  statusNoSorteio,
  sortearTimesPorTamanho,
  amplitudeEntreTimesCheios,
  type JogadorSorteio,
} from './sorteio.js';

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

  it('equilibra times do mesmo tamanho dentro de 2 estrelas em distribuições irregulares', () => {
    // A serpentina sozinha deixava diferenças de até 4 estrelas aqui.
    let pior = 0;
    for (let caso = 0; caso < 120; caso++) {
      let a = (caso + 1) >>> 0;
      const rand = () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
      const nTimes = 2 + (caso % 3);
      const jogadores: JogadorSorteio[] = Array.from({ length: nTimes * 5 }, (_, i) => ({
        profileId: `p${i}`,
        nome: `Jogador ${i}`,
        estrelas: 1 + Math.floor(rand() * 5),
      }));
      pior = Math.max(pior, amplitudeEstrelas(sortearTimes(jogadores, nTimes, { seed: caso })));
    }
    expect(pior).toBeLessThanOrEqual(2);
  });

  it('rejeita nº de times fora de 2..32', () => {
    const jogadores = gerar({ 3: 10 });
    expect(() => sortearTimes(jogadores, 1)).toThrow();
    expect(() => sortearTimes(jogadores, 33)).toThrow();
  });

  it('rejeita menos jogadores que times', () => {
    expect(() => sortearTimes(gerar({ 3: 3 }), 4)).toThrow();
  });

  it('espalha os jogadores de 1 estrela o mais igual possível entre os times (nunca mais que o inevitável)', () => {
    // Varia contagens de "outros" e de 1-estrela, times e sementes — não só casos
    // onde a serpentina já acerta por acaso (contagens múltiplas do ciclo dela).
    let piorCaso = '';
    for (let caso = 0; caso < 150; caso++) {
      let a = (caso + 1) >>> 0;
      const rand = () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
      const nTimes = 2 + Math.floor(rand() * 5); // 2..6
      const umaEstrela = 1 + Math.floor(rand() * (nTimes + 3)); // varia em torno de nTimes
      const outros = nTimes + Math.floor(rand() * 20);
      const jogadores: JogadorSorteio[] = [
        ...gerar({ 1: umaEstrela }),
        ...Array.from({ length: outros }, (_, i) => ({
          profileId: `o${caso}-${i}`,
          nome: `Outro ${i}`,
          estrelas: 2 + Math.floor(rand() * 4), // 2..5
        })),
      ];
      if (jogadores.length < nTimes) continue;

      const times = sortearTimes(jogadores, nTimes, { seed: caso });
      const porTime = times.map((t) => t.jogadores.filter((j) => j.estrelas === 1).length);
      const maximoInevitavel = Math.ceil(umaEstrela / nTimes);
      if (Math.max(...porTime) > maximoInevitavel) {
        piorCaso = `nTimes=${nTimes} umaEstrela=${umaEstrela} outros=${outros} seed=${caso} -> ${porTime} (máximo deveria ser ${maximoInevitavel})`;
        break;
      }
    }
    expect(piorCaso).toBe('');
  });
});

describe('peladaExigePagamento', () => {
  it('exige quando a pelada tem valor maior que zero (texto numérico do banco ou número)', () => {
    expect(peladaExigePagamento('30.00')).toBe(true);
    expect(peladaExigePagamento('0.50')).toBe(true);
    expect(peladaExigePagamento(30)).toBe(true);
  });

  it('não exige quando não há valor a pagar', () => {
    expect(peladaExigePagamento(null)).toBe(false);
    expect(peladaExigePagamento(undefined)).toBe(false);
    expect(peladaExigePagamento('')).toBe(false);
    expect(peladaExigePagamento('0')).toBe(false);
    expect(peladaExigePagamento('0.00')).toBe(false);
    expect(peladaExigePagamento(0)).toBe(false);
  });

  it('valor ilegível não conta como cobrança', () => {
    expect(peladaExigePagamento('abc')).toBe(false);
    expect(peladaExigePagamento('-5')).toBe(false);
  });
});

describe('statusNoSorteio', () => {
  it('pelada com valor: só quem pagou entra no sorteio', () => {
    expect(statusNoSorteio('30.00')).toEqual(['pago']);
  });

  it('pelada sem valor: confirmados e pagos entram', () => {
    expect(statusNoSorteio(null)).toEqual(['confirmado', 'pago']);
    expect(statusNoSorteio('0.00')).toEqual(['confirmado', 'pago']);
  });

  it('desistiu nunca entra', () => {
    expect(statusNoSorteio('30.00')).not.toContain('desistiu');
    expect(statusNoSorteio(null)).not.toContain('desistiu');
  });
});

describe('sortearTimesPorTamanho', () => {
  const tamanhos = (times: { jogadores: unknown[] }[]) => times.map((t) => t.jogadores.length);
  const todosOsIds = (times: { jogadores: { profileId: string }[] }[]) =>
    times.flatMap((t) => t.jogadores.map((j) => j.profileId)).sort();

  it('11 jogadores com 5 por time: 2 times de 5 e um time com o que sobrou', () => {
    const jogadores = gerar({ 3: 11 });
    const times = sortearTimesPorTamanho(jogadores, 5, { seed: 7 });
    expect(tamanhos(times)).toEqual([5, 5, 1]);
    expect(times.map((t) => t.numero)).toEqual([1, 2, 3]);
  });

  it('todo mundo aparece exatamente uma vez, inclusive quem sobrou', () => {
    const jogadores = gerar({ 5: 2, 4: 3, 3: 4, 2: 2 }); // 11
    const times = sortearTimesPorTamanho(jogadores, 5, { seed: 3 });
    expect(todosOsIds(times)).toEqual(jogadores.map((j) => j.profileId).sort());
  });

  it('12 jogadores com 5 por time: o time da sobra fica com 2', () => {
    const times = sortearTimesPorTamanho(gerar({ 3: 12 }), 5, { seed: 1 });
    expect(tamanhos(times)).toEqual([5, 5, 2]);
  });

  it('sem sobra (10 com 5 por time): dois times de 5, sem time extra', () => {
    const times = sortearTimesPorTamanho(gerar({ 3: 10 }), 5, { seed: 1 });
    expect(tamanhos(times)).toEqual([5, 5]);
  });

  it('um time cheio e a sobra (7 com 5 por time): 5 e 2', () => {
    const times = sortearTimesPorTamanho(gerar({ 3: 7 }), 5, { seed: 1 });
    expect(tamanhos(times)).toEqual([5, 2]);
  });

  it('os times completos continuam equilibrados por estrela', () => {
    const times = sortearTimesPorTamanho(gerar({ 3: 11 }), 5, { seed: 9 });
    expect(times[0]!.totalEstrelas).toBe(times[1]!.totalEstrelas);
  });

  it('recusa quando não dá para formar 2 times', () => {
    expect(() => sortearTimesPorTamanho(gerar({ 3: 5 }), 5)).toThrow(/2 times/);
    expect(() => sortearTimesPorTamanho(gerar({ 3: 4 }), 5)).toThrow(/2 times/);
  });

  it('com a mesma semente o resultado se repete, inclusive quem sobra', () => {
    const jogadores = gerar({ 5: 3, 4: 3, 3: 3, 2: 2 });
    const a = sortearTimesPorTamanho(jogadores, 5, { seed: 42 });
    const b = sortearTimesPorTamanho(jogadores, 5, { seed: 42 });
    expect(a.map((t) => t.jogadores.map((j) => j.profileId))).toEqual(
      b.map((t) => t.jogadores.map((j) => j.profileId)),
    );
  });

  it('recusa tamanho de time inválido', () => {
    expect(() => sortearTimesPorTamanho(gerar({ 3: 10 }), 0)).toThrow();
  });
});

describe('amplitudeEntreTimesCheios', () => {
  const t = (numero: number, qtd: number, total: number) => ({
    numero,
    jogadores: new Array(qtd).fill(null),
    totalEstrelas: total,
  });

  it('ignora o time da sobra', () => {
    expect(amplitudeEntreTimesCheios([t(1, 5, 15), t(2, 5, 14), t(3, 1, 3)])).toBe(1);
  });

  it('com só um time cheio e a sobra, compara os dois', () => {
    expect(amplitudeEntreTimesCheios([t(1, 6, 18), t(2, 5, 15)])).toBe(3);
  });

  it('times todos do mesmo tamanho: compara todos', () => {
    expect(amplitudeEntreTimesCheios([t(1, 5, 15), t(2, 5, 12), t(3, 5, 14)])).toBe(3);
  });

  it('sem times ou com um só, é zero', () => {
    expect(amplitudeEntreTimesCheios([])).toBe(0);
    expect(amplitudeEntreTimesCheios([t(1, 5, 15)])).toBe(0);
  });
});
