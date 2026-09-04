/**
 * Atributos da "cartinha" do jogador — estilo FIFA/FUT.
 *
 * MVP: derivados de estrelas (1–5) + posição, de forma DETERMINÍSTICA
 * (mesma entrada → mesma carta). Depois entram os bônus de desempenho
 * (gols, assistências, presença, cartões) somados por cima.
 */

export type Posicao = 'goleiro' | 'zagueiro' | 'lateral' | 'meio' | 'atacante';
export const ATRIBUTOS = ['rit', 'tir', 'pas', 'dri', 'def', 'fis'] as const;
export type Atributo = (typeof ATRIBUTOS)[number];

/**
 * Atributos exibidos na arte da cartinha — só 4, em uma única fileira, para
 * não cobrir a foto do jogador (os 6 continuam sendo calculados e pesam no
 * overall).
 */
export const ATRIBUTOS_CARTA: readonly Atributo[] = ['rit', 'tir', 'pas', 'def'];

export const ROTULO_ATRIBUTO: Record<Atributo, string> = {
  rit: 'RIT',
  tir: 'TIR',
  pas: 'PAS',
  dri: 'DRI',
  def: 'DEF',
  fis: 'FÍS',
};

export interface AtributosCartinha {
  overall: number;
  rit: number;
  tir: number;
  pas: number;
  dri: number;
  def: number;
  fis: number;
}

export interface DesempenhoCartinha {
  jogos?: number;
  gols?: number;
  assistencias?: number;
  cartoes?: number;
}

export interface EntradaCartinha {
  profileId: string;
  estrelas: number;
  posicao?: Posicao | null;
  desempenho?: DesempenhoCartinha;
}

// base de overall por estrela
const BASE_POR_ESTRELA: Record<number, number> = { 1: 56, 2: 66, 3: 75, 4: 84, 5: 91 };

// deslocamento de cada atributo conforme a posição
const PESOS: Record<Posicao, Partial<Record<Atributo, number>>> = {
  goleiro: { def: 10, fis: 6, pas: -4, tir: -12, dri: -8, rit: -6 },
  zagueiro: { def: 12, fis: 8, rit: -6, dri: -6, tir: -8 },
  lateral: { rit: 8, def: 6, pas: 4, fis: 2, tir: -4 },
  meio: { pas: 10, dri: 8, rit: 2, def: -2, fis: -2 },
  atacante: { tir: 12, rit: 8, dri: 6, def: -12, pas: -2 },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** jitter estável em [-amp, +amp] a partir de uma semente textual */
function jitter(seed: string, amp: number): number {
  return (hash(seed) % (amp * 2 + 1)) - amp;
}

const clamp = (n: number, lo = 30, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));

export function calcularAtributos(e: EntradaCartinha): AtributosCartinha {
  const estrelas = Math.min(5, Math.max(1, Math.round(e.estrelas || 3)));
  const base = BASE_POR_ESTRELA[estrelas]!;
  const pos = e.posicao ?? 'meio';
  const pesos = PESOS[pos] ?? {};

  // bônus de desempenho (limitados, para não estourar)
  const d = e.desempenho ?? {};
  const jogos = Math.max(0, d.jogos ?? 0);
  const porJogo = (x?: number) => (jogos > 0 ? (x ?? 0) / jogos : 0);
  const bonus: Partial<Record<Atributo, number>> = {
    tir: Math.min(8, porJogo(d.gols) * 6),
    pas: Math.min(6, porJogo(d.assistencias) * 6),
    dri: Math.min(4, porJogo(d.gols) * 2 + porJogo(d.assistencias) * 2),
    fis: Math.min(6, Math.log2(jogos + 1) * 1.5),
    def: -Math.min(6, porJogo(d.cartoes) * 8),
  };

  const attrs = {} as Record<Atributo, number>;
  for (const a of ATRIBUTOS) {
    attrs[a] = clamp(base + (pesos[a] ?? 0) + jitter(e.profileId + a, 3) + (bonus[a] ?? 0));
  }

  // overall = mistura ponderada pela posição, puxando pra base das estrelas
  const fortes: Atributo[] =
    pos === 'goleiro' || pos === 'zagueiro'
      ? ['def', 'fis', 'pas']
      : pos === 'atacante'
        ? ['tir', 'rit', 'dri']
        : ['pas', 'dri', 'rit'];
  const mediaFortes = fortes.reduce((s, a) => s + attrs[a], 0) / fortes.length;
  const overall = clamp(base * 0.55 + mediaFortes * 0.45, 40, 99);

  return { overall, ...attrs };
}

export function selo(posicao?: Posicao | null): string {
  return (
    { goleiro: 'GOL', zagueiro: 'ZAG', lateral: 'LAT', meio: 'MEI', atacante: 'ATA' }[
      posicao ?? 'meio'
    ] ?? 'MEI'
  );
}

export function seloPe(pe?: string | null): string {
  return { direito: 'D', esquerdo: 'E', ambidestro: 'A' }[pe ?? ''] ?? '—';
}
