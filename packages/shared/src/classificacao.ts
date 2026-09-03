import type { LinhaClassificacao } from './schemas/torneio.js';

export interface TimeParaClassificacao {
  id: string;
  nome: string;
  grupo: string | null;
}

export interface JogoParaClassificacao {
  timeAId: string | null;
  timeBId: string | null;
  placarA: number | null;
  placarB: number | null;
  status: string;
}

/** Tabela de classificação: 3 pts vitória, 1 empate, 0 derrota. Só jogos encerrados. */
export function calcularClassificacao(
  times: TimeParaClassificacao[],
  jogos: JogoParaClassificacao[],
): LinhaClassificacao[] {
  const linhas = new Map<string, LinhaClassificacao>();
  for (const t of times) {
    linhas.set(t.id, {
      timeId: t.id,
      nome: t.nome,
      grupo: t.grupo,
      pontos: 0,
      jogos: 0,
      vitorias: 0,
      empates: 0,
      derrotas: 0,
      golsPro: 0,
      golsContra: 0,
      saldo: 0,
    });
  }

  for (const j of jogos) {
    if (j.status !== 'encerrado' || j.placarA == null || j.placarB == null) continue;
    const a = j.timeAId ? linhas.get(j.timeAId) : undefined;
    const b = j.timeBId ? linhas.get(j.timeBId) : undefined;
    if (!a || !b) continue;

    a.jogos++;
    b.jogos++;
    a.golsPro += j.placarA;
    a.golsContra += j.placarB;
    b.golsPro += j.placarB;
    b.golsContra += j.placarA;

    if (j.placarA > j.placarB) {
      a.vitorias++;
      a.pontos += 3;
      b.derrotas++;
    } else if (j.placarB > j.placarA) {
      b.vitorias++;
      b.pontos += 3;
      a.derrotas++;
    } else {
      a.empates++;
      b.empates++;
      a.pontos += 1;
      b.pontos += 1;
    }
  }

  const out = [...linhas.values()];
  for (const l of out) l.saldo = l.golsPro - l.golsContra;
  out.sort(
    (x, y) =>
      y.pontos - x.pontos ||
      y.saldo - x.saldo ||
      y.golsPro - x.golsPro ||
      x.nome.localeCompare(y.nome),
  );
  return out;
}
