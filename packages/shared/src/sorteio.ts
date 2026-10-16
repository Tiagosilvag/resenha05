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

  equilibrar(times);
  return times;
}

function estrelasDe(j: JogadorSorteio): number {
  return Math.min(5, Math.max(1, Math.round(j.estrelas)));
}

/**
 * Sorteio por tamanho de time: formam-se tantos times de exatamente `porTime`
 * jogadores quantos couberem (equilibrados por estrela) e quem sobra vai para um
 * time extra, menor, numerado por último. Ex.: 11 jogadores com 5 por time →
 * times de 5, 5 e 1. Quem sobra é escolhido por sorteio, não por estrela.
 */
export function sortearTimesPorTamanho(
  jogadores: JogadorSorteio[],
  porTime: number,
  opcoes: OpcoesSorteio = {},
): TimeSorteado[] {
  if (!Number.isInteger(porTime) || porTime < 1) {
    throw new Error('Jogadores por time deve ser um número inteiro maior que zero.');
  }
  const cheios = Math.floor(jogadores.length / porTime);
  const resto = jogadores.length % porTime;
  const total = cheios + (resto > 0 ? 1 : 0);
  if (total < 2) {
    throw new Error('Não dá para formar 2 times com esse número de jogadores.');
  }
  if (total > 32) {
    throw new Error('Número de times deve estar entre 2 e 32.');
  }

  const semente = opcoes.seed ?? (Math.random() * 2 ** 32) >>> 0;
  const rand = rng(semente);
  const embaralhados = embaralhar(jogadores, rand);
  const sobra = embaralhados.slice(0, resto);
  const nosTimes = embaralhados.slice(resto);

  const times: TimeSorteado[] =
    cheios >= 2
      ? sortearTimes(nosTimes, cheios, { seed: (rand() * 2 ** 32) >>> 0 })
      : [
          {
            numero: 1,
            jogadores: nosTimes,
            totalEstrelas: nosTimes.reduce((s, j) => s + estrelasDe(j), 0),
          },
        ];

  if (resto > 0) {
    times.push({
      numero: cheios + 1,
      jogadores: sobra,
      totalEstrelas: sobra.reduce((s, j) => s + estrelasDe(j), 0),
    });
  }
  return times;
}

/** Diferença entre o time mais forte e o mais fraco (em estrelas). */
export function amplitudeEstrelas(times: { totalEstrelas: number }[]): number {
  const totais = times.map((t) => t.totalEstrelas);
  return Math.max(...totais) - Math.min(...totais);
}

/**
 * Como `amplitudeEstrelas`, mas ignora o time da sobra: o último, quando é menor
 * que os demais e eles têm todos o mesmo tamanho (senão a comparação não faria
 * sentido, já que o time menor sempre soma menos estrelas).
 */
export function amplitudeEntreTimesCheios(
  times: { numero: number; jogadores: unknown[]; totalEstrelas: number }[],
): number {
  if (times.length < 2) return 0;
  const ordenados = [...times].sort((a, b) => a.numero - b.numero);
  const ultimo = ordenados[ordenados.length - 1]!;
  const anteriores = ordenados.slice(0, -1);
  const tamanho = anteriores[0]!.jogadores.length;
  const temSobra =
    anteriores.length >= 2 &&
    ultimo.jogadores.length < tamanho &&
    anteriores.every((t) => t.jogadores.length === tamanho);
  return amplitudeEstrelas(temSobra ? anteriores : ordenados);
}

/**
 * Aparo final: troca jogadores entre o time mais forte e o mais fraco enquanto
 * isso encurtar a distância entre eles. A serpentina sozinha ainda deixa
 * diferenças de 3–4 estrelas em distribuições irregulares.
 *
 * As trocas são sempre 1 por 1, então os tamanhos dos times não mudam, e a
 * escolha é determinística — mesma semente, mesmo resultado.
 */
function equilibrar(times: TimeSorteado[], maxPassos = 200): void {
  const estrela = (j: JogadorSorteio) => Math.min(5, Math.max(1, Math.round(j.estrelas)));

  for (let passo = 0; passo < maxPassos; passo++) {
    let forte = times[0]!;
    let fraco = times[0]!;
    for (const t of times) {
      if (t.totalEstrelas > forte.totalEstrelas) forte = t;
      if (t.totalEstrelas < fraco.totalEstrelas) fraco = t;
    }
    const distancia = forte.totalEstrelas - fraco.totalEstrelas;
    // 1 estrela é a paridade possível quando a soma total é ímpar.
    if (distancia <= 1) return;

    let melhor: { i: number; j: number; distancia: number } | null = null;
    for (let i = 0; i < forte.jogadores.length; i++) {
      for (let j = 0; j < fraco.jogadores.length; j++) {
        const ganho = estrela(forte.jogadores[i]!) - estrela(fraco.jogadores[j]!);
        if (ganho <= 0) continue;
        const nova = Math.abs(distancia - 2 * ganho);
        if (nova < distancia && (!melhor || nova < melhor.distancia)) {
          melhor = { i, j, distancia: nova };
        }
      }
    }
    if (!melhor) return;

    const doForte = forte.jogadores[melhor.i]!;
    const doFraco = fraco.jogadores[melhor.j]!;
    forte.jogadores[melhor.i] = doFraco;
    fraco.jogadores[melhor.j] = doForte;
    const ganho = estrela(doForte) - estrela(doFraco);
    forte.totalEstrelas -= ganho;
    fraco.totalEstrelas += ganho;
  }
}

/**
 * A pelada cobra algo? `valor` vem do banco como texto numérico ("30.00") ou
 * null. Sem valor a pagar não existe "pago", então a regra de pagamento não
 * se aplica.
 */
export function peladaExigePagamento(valor: string | number | null | undefined): boolean {
  if (valor === null || valor === undefined || valor === '') return false;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0;
}

/**
 * Status de presença que entram no sorteio: numa pelada com valor, só quem já
 * pagou; numa pelada sem valor, quem confirmou ou pagou. Quem desistiu nunca.
 */
export function statusNoSorteio(valor: string | number | null | undefined): ('confirmado' | 'pago')[] {
  return peladaExigePagamento(valor) ? ['pago'] : ['confirmado', 'pago'];
}
