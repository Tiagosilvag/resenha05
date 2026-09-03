/**
 * Sorteio balanceado por estrelas — draft em serpentina (snake draft).
 *
 * Ordena os jogadores por estrela decrescente e distribui em zigue-zague entre
 * os times, de modo que a soma de estrelas por time fique dentro de ±1 estrela,
 * independentemente de quantos jogadores de cada nível existirem.
 *
 * O desempate entre jogadores de mesma estrela é aleatório (com semente
 * opcional, para o resultado ser reproduzível em teste) e NUNCA reabre a
 * ordenação principal por estrela.
 */

export interface JogadorSorteio {
  profileId: string;
  nome: string | null;
  estrelas: number;
}

export interface TimeSorteado {
  numero: number;
  jogadores: JogadorSorteio[];
  totalEstrelas: number;
}

/** PRNG determinístico (mulberry32) para desempate reproduzível. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface OpcoesSorteio {
  /** Semente para o desempate. Omita para aleatório de verdade. */
  seed?: number;
}

export function sortearTimes(
  jogadores: JogadorSorteio[],
  nTimes: number,
  opcoes: OpcoesSorteio = {},
): TimeSorteado[] {
  if (nTimes < 2 || nTimes > 32) {
    throw new Error('Número de times deve estar entre 2 e 32.');
  }
  if (jogadores.length < nTimes) {
    throw new Error('Menos jogadores confirmados do que times.');
  }

  const rand = rng(opcoes.seed ?? (Math.random() * 2 ** 32) >>> 0);

  // Agrupa por estrela, embaralha dentro do grupo, concatena do maior p/ o menor.
  const porEstrela = new Map<number, JogadorSorteio[]>();
  for (const j of jogadores) {
    const e = Math.min(5, Math.max(1, Math.round(j.estrelas)));
    let grupo = porEstrela.get(e);
    if (!grupo) {
      grupo = [];
      porEstrela.set(e, grupo);
    }
    grupo.push(j);
  }
  const ordenados: JogadorSorteio[] = [];
  for (let e = 5; e >= 1; e--) {
    const grupo = porEstrela.get(e);
    if (grupo) ordenados.push(...embaralhar(grupo, rand));
  }

  const times: TimeSorteado[] = Array.from({ length: nTimes }, (_, i) => ({
    numero: i + 1,
    jogadores: [],
    totalEstrelas: 0,
  }));

  let i = 0;
  let direcao = 1;
  for (const jogador of ordenados) {
    const time = times[i]!;
    time.jogadores.push(jogador);
    time.totalEstrelas += Math.min(5, Math.max(1, Math.round(jogador.estrelas)));

    i += direcao;
    if (i === nTimes || i === -1) {
      direcao *= -1;
      i += direcao;
    }
  }

  return times;
}

/** Diferença entre o time mais forte e o mais fraco (em estrelas). */
export function amplitudeEstrelas(times: TimeSorteado[]): number {
  const totais = times.map((t) => t.totalEstrelas);
  return Math.max(...totais) - Math.min(...totais);
}
