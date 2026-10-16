export interface JogadorDaPartida {
  profileId: string;
  estrelas: number;
}

export interface TimeDaPartida {
  id: string;
  jogadores: JogadorDaPartida[];
}

export interface EntradaRedistribuicao {
  /** Time que não perdeu: continua em quadra e é a referência de equilíbrio. */
  vencedor: TimeDaPartida;
  /** Time que perdeu: se desfaz para completar o time que sobrou. */
  perdedor: TimeDaPartida;
  /** Time incompleto (ex.: 1 jogador) que esperava fora da partida. */
  sobra: TimeDaPartida;
  /** Jogadores de um time completo. */
  porTime: number;
  /** Semente do sorteio entre combinações igualmente equilibradas. Omita para aleatório. */
  seed?: number;
}

export interface ResultadoRedistribuicao {
  /** Todos os jogadores do time da sobra depois de completo (os que já estavam + os que entraram). */
  sobraCompleta: string[];
  /** Os que vieram do time perdedor para o time da sobra. */
  novosNaSobra: string[];
  /** Quem do time perdedor não entrou: vira o novo time incompleto. */
  ficamNoPerdedor: string[];
  /** Estrelas do time da sobra depois de completo. */
  totalNovoTime: number;
  /** |estrelas do novo time − estrelas do vencedor|. */
  diferenca: number;
}

function somaEstrelas(js: JogadorDaPartida[]): number {
  return js.reduce((s, j) => s + j.estrelas, 0);
}

/** PRNG determinístico (mulberry32), o mesmo do sorteio de times. */
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

/** Todas as combinações de `k` posições entre `n`, em ordem lexicográfica. */
function combinacoes(n: number, k: number): number[][] {
  const out: number[][] = [];
  const atual: number[] = [];
  const buscar = (inicio: number) => {
    if (atual.length === k) {
      out.push([...atual]);
      return;
    }
    for (let i = inicio; i <= n - (k - atual.length); i++) {
      atual.push(i);
      buscar(i + 1);
      atual.pop();
    }
  };
  buscar(0);
  return out;
}

/**
 * Depois de uma partida, o time que perdeu se desfaz para completar o time que
 * sobrou: entram os jogadores do perdedor que deixam o novo time o mais
 * parecido possível, em estrelas, com o time que continua em quadra (é contra
 * ele que o novo time joga em seguida). Quem não entra vira o novo time
 * incompleto.
 *
 * Todas as escolhas possíveis são comparadas, então o que já está na sobra
 * conta: com um jogador de 5 estrelas lá, entram os mais fracos; com um de 1,
 * os mais fortes — sem regra fixa de "sempre o mais fraco". Se mais de uma
 * escolha empata em equilíbrio, uma delas é sorteada (reproduzível com `seed`).
 */
export function redistribuirPerdedor(e: EntradaRedistribuicao): ResultadoRedistribuicao {
  const faltam = e.porTime - e.sobra.jogadores.length;
  if (faltam <= 0) {
    throw new Error('O time que sobrou já está completo.');
  }
  if (e.perdedor.jogadores.length < faltam) {
    throw new Error('O time perdedor não tem jogadores suficientes para completar o outro.');
  }

  const base = somaEstrelas(e.sobra.jogadores);
  const alvo = somaEstrelas(e.vencedor.jogadores);
  const jogadores = e.perdedor.jogadores;

  let melhorDiferenca = Infinity;
  let empatadas: number[][] = [];
  for (const indices of combinacoes(jogadores.length, faltam)) {
    const escolhidos = indices.map((i) => jogadores[i]!);
    const diferenca = Math.abs(base + somaEstrelas(escolhidos) - alvo);
    if (diferenca < melhorDiferenca) {
      melhorDiferenca = diferenca;
      empatadas = [indices];
    } else if (diferenca === melhorDiferenca) {
      empatadas.push(indices);
    }
  }

  const rand = rng(e.seed ?? (Math.random() * 2 ** 32) >>> 0);
  const indices = empatadas[Math.floor(rand() * empatadas.length)]!;

  const escolhidos = new Set(indices);
  const novos = jogadores.filter((_, i) => escolhidos.has(i));
  const restantes = jogadores.filter((_, i) => !escolhidos.has(i));
  return {
    sobraCompleta: [...e.sobra.jogadores, ...novos].map((j) => j.profileId),
    novosNaSobra: novos.map((j) => j.profileId),
    ficamNoPerdedor: restantes.map((j) => j.profileId),
    totalNovoTime: base + somaEstrelas(novos),
    diferenca: melhorDiferenca,
  };
}

export type LadoDaPartida = 'a' | 'b';

/** Quem ganhou pelo placar; igualdade é empate (quem sai, nesse caso, o admin escolhe). */
export function resultadoDaPartida(placarA: number, placarB: number): LadoDaPartida | 'empate' {
  if (placarA > placarB) return 'a';
  if (placarB > placarA) return 'b';
  return 'empate';
}

/** Lado que chegou ao limite de gols da pelada (encerra a partida), se houver. */
export function atingiuLimiteDeGols(
  placarA: number,
  placarB: number,
  golsParaEncerrar: number | null,
): LadoDaPartida | null {
  if (!golsParaEncerrar) return null;
  if (placarA >= golsParaEncerrar && placarA >= placarB) return 'a';
  if (placarB >= golsParaEncerrar) return 'b';
  return null;
}

export interface RelogioDaPartida {
  /** Segundos já corridos antes do trecho atual (pausas anteriores). */
  acumuladoSeg: number;
  /** Quando o trecho atual começou; null com a partida pausada ou não iniciada. */
  retomadoEm: Date | null;
}

export function decorridoSegundos(r: RelogioDaPartida, agora: Date): number {
  const trecho = r.retomadoEm ? Math.max(0, Math.floor((agora.getTime() - r.retomadoEm.getTime()) / 1000)) : 0;
  return r.acumuladoSeg + trecho;
}

export function tempoEsgotado(decorridoSeg: number, duracaoMin: number | null): boolean {
  return duracaoMin != null && decorridoSeg >= duracaoMin * 60;
}

/**
 * Instante em que o tempo acabou: o trecho em andamento começou em `retomadoEm`
 * e faltavam `duracao − acumulado` segundos. Serve para gravar o horário exato
 * do fim mesmo que ninguém estivesse com a tela aberta.
 */
export function instanteDoFimPorTempo(r: RelogioDaPartida & { retomadoEm: Date }, duracaoMin: number): Date {
  const restante = Math.max(0, duracaoMin * 60 - r.acumuladoSeg);
  return new Date(r.retomadoEm.getTime() + restante * 1000);
}

export interface TimeParaSugestao {
  id: string;
  numero: number;
  jogadores: number;
}

export interface PartidaParaSugestao {
  timeAId: string;
  timeBId: string;
  /** Time que não perdeu (quando houve perdedor confirmado). */
  vencedorId: string | null;
}

/**
 * Próxima partida sugerida, a partir das já jogadas (da mais antiga para a mais
 * recente). Na primeira, os dois menores números entre os times completos. Nas
 * seguintes, quem ficou em quadra enfrenta quem espera há mais tempo (os que
 * nunca jogaram primeiro); o time incompleto só entra depois de completado.
 */
export function sugerirProximaPartida(
  times: TimeParaSugestao[],
  anteriores: PartidaParaSugestao[],
): { timeAId: string; timeBId: string } | null {
  if (times.length < 2) return null;
  const porTime = Math.max(...times.map((t) => t.jogadores));
  const completos = times.filter((t) => t.jogadores >= porTime).sort((a, b) => a.numero - b.numero);
  const candidatos = completos.length >= 2 ? completos : [...times].sort((a, b) => a.numero - b.numero);

  const ultima = anteriores[anteriores.length - 1];
  if (!ultima) return { timeAId: candidatos[0]!.id, timeBId: candidatos[1]!.id };

  const ultimaVez = new Map<string, number>();
  anteriores.forEach((p, i) => {
    ultimaVez.set(p.timeAId, i);
    ultimaVez.set(p.timeBId, i);
  });
  const quemFica = ultima.vencedorId ?? null;
  const esperando = candidatos
    .filter((t) => t.id !== ultima.timeAId && t.id !== ultima.timeBId)
    .sort((a, b) => (ultimaVez.get(a.id) ?? -1) - (ultimaVez.get(b.id) ?? -1) || a.numero - b.numero);

  if (esperando.length === 0) return { timeAId: ultima.timeAId, timeBId: ultima.timeBId };
  if (quemFica) return { timeAId: quemFica, timeBId: esperando[0]!.id };
  if (esperando.length >= 2) return { timeAId: esperando[0]!.id, timeBId: esperando[1]!.id };
  return { timeAId: esperando[0]!.id, timeBId: ultima.timeAId };
}

export interface EntradaSubstituicao {
  /** Quem sai (cansado, machucado) e os colegas que continuam, em estrelas. */
  saindo: JogadorDaPartida;
  /** Time de quem sai, incluindo quem sai. */
  meuTime: JogadorDaPartida[];
  /** O adversário da partida em andamento. */
  adversario: JogadorDaPartida[];
  /** Quem espera e pode entrar (de fora da partida). */
  candidatos: JogadorDaPartida[];
}

export interface CandidatoSubstituto extends JogadorDaPartida {
  /** Média de estrelas do time depois da troca. */
  mediaDoTime: number;
  /** |média do time depois da troca − média do adversário|: menor = melhor encaixe. */
  diferenca: number;
}

function media(js: JogadorDaPartida[]): number {
  return js.length === 0 ? 0 : somaEstrelas(js) / js.length;
}

/**
 * Candidatos a substituir um jogador, do que melhor se encaixa para o pior. O
 * encaixe é o time (sem quem sai, com quem entra) ficar com a força mais
 * próxima da do adversário — compara médias, então vale mesmo com times de
 * tamanhos diferentes. No empate, vence quem tem estrelas mais parecidas com as
 * de quem sai; persistindo, a ordem recebida.
 */
export function rankearSubstitutos(e: EntradaSubstituicao): CandidatoSubstituto[] {
  const restantes = e.meuTime.filter((j) => j.profileId !== e.saindo.profileId);
  const alvo = media(e.adversario);
  return e.candidatos
    .map((c, ordem) => {
      const mediaDoTime = media([...restantes, c]);
      return { c, ordem, mediaDoTime, diferenca: Math.abs(mediaDoTime - alvo) };
    })
    .sort(
      (x, y) =>
        x.diferenca - y.diferenca ||
        Math.abs(x.c.estrelas - e.saindo.estrelas) - Math.abs(y.c.estrelas - e.saindo.estrelas) ||
        x.ordem - y.ordem,
    )
    .map(({ c, mediaDoTime, diferenca }) => ({ ...c, mediaDoTime, diferenca }));
}

/**
 * Fila dos times que estão esperando (fora da partida em andamento), do próximo
 * a jogar ao último: os completos antes dos incompletos, e entre iguais quem
 * jogou há mais tempo (quem nunca jogou primeiro), depois pelo número do time.
 */
export function filaDeEspera(
  times: TimeParaSugestao[],
  anteriores: { timeAId: string; timeBId: string }[],
  emJogo: string[],
): string[] {
  const porTime = Math.max(0, ...times.map((t) => t.jogadores));
  const ultimaVez = new Map<string, number>();
  anteriores.forEach((p, i) => {
    ultimaVez.set(p.timeAId, i);
    ultimaVez.set(p.timeBId, i);
  });
  return times
    .filter((t) => !emJogo.includes(t.id))
    .sort(
      (a, b) =>
        Number(b.jogadores >= porTime) - Number(a.jogadores >= porTime) ||
        (ultimaVez.get(a.id) ?? -1) - (ultimaVez.get(b.id) ?? -1) ||
        a.numero - b.numero,
    )
    .map((t) => t.id);
}
