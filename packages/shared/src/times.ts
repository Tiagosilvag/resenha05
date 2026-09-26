/**
 * Times do coração — catálogo de cores e do "desenho da camisa" que a
 * cartinha do jogador usa. Sem escudos (marca registrada): só cores +
 * um padrão (listras, aros, metades, faixa) que lembra a camisa.
 *
 * Nome desconhecido → TEMA_PADRAO (ouro Resenha05).
 */

export type PadraoCamisa = 'liso' | 'listras' | 'aros' | 'metades' | 'faixa';

export interface TemaTime {
  id: string;
  nome: string;
  /** outras formas de escrever/apelidos (sem acento, minúsculas) */
  aliases: string[];
  /** base escura da carta */
  fundo: string;
  /** cores da camisa, na ordem em que aparecem no padrão */
  primaria: string;
  secundaria: string;
  terciaria?: string;
  /** cor de destaque (OVR, nome, borda) — precisa ter contraste com o fundo */
  destaque: string;
  /** traço interno e moldura (default: destaque escurecido) */
  contorno?: string;
  padrao: PadraoCamisa;
  /** largura de cada listra/aro em px (default 60) */
  larg?: number;
}

export const TEMA_PADRAO: TemaTime = {
  id: 'resenha05',
  nome: 'Resenha05',
  aliases: [],
  fundo: '#0d0d0e',
  primaria: '#E7C158',
  secundaria: '#B9902F',
  destaque: '#E7C158',
  contorno: '#B9902F',
  padrao: 'liso',
};

const t = (x: TemaTime): TemaTime => x;

export const TEMAS: TemaTime[] = [
  // ── Brasil ────────────────────────────────────────────────────────────────
  t({ id: 'flamengo', nome: 'Flamengo', aliases: ['fla', 'mengao', 'cr flamengo'], fundo: '#120a08', primaria: '#D71920', secundaria: '#0B0B0B', destaque: '#E23D28', contorno: '#8C1A0F', padrao: 'aros' }),
  t({ id: 'corinthians', nome: 'Corinthians', aliases: ['timao', 'sc corinthians'], fundo: '#0c0c0d', primaria: '#F2F2F2', secundaria: '#1C1C1C', destaque: '#D7D7D7', contorno: '#7A7A7A', padrao: 'metades' }),
  t({ id: 'palmeiras', nome: 'Palmeiras', aliases: ['verdao', 'se palmeiras'], fundo: '#06120c', primaria: '#0B8F45', secundaria: '#FFFFFF', destaque: '#1D9E5E', contorno: '#0C5C36', padrao: 'liso' }),
  t({ id: 'sao-paulo', nome: 'São Paulo', aliases: ['sao paulo', 'spfc', 'tricolor paulista'], fundo: '#100a0b', primaria: '#E4002B', secundaria: '#FFFFFF', terciaria: '#0B0B0B', destaque: '#E03A3E', contorno: '#8E1F22', padrao: 'aros' }),
  t({ id: 'santos', nome: 'Santos', aliases: ['peixe', 'santos fc'], fundo: '#0c0c0c', primaria: '#FFFFFF', secundaria: '#1A1A1A', destaque: '#E4E4E4', contorno: '#767676', padrao: 'liso' }),
  t({ id: 'vasco', nome: 'Vasco', aliases: ['vasco da gama', 'cruzmaltino'], fundo: '#0b0b0c', primaria: '#1A1A1A', secundaria: '#FFFFFF', destaque: '#E8E8E8', contorno: '#6F6F6F', padrao: 'faixa' }),
  t({ id: 'botafogo', nome: 'Botafogo', aliases: ['fogao', 'botafogo rj'], fundo: '#0a0a0a', primaria: '#F5F5F5', secundaria: '#0A0A0A', destaque: '#DCDCDC', contorno: '#6C6C6C', padrao: 'listras', larg: 44 }),
  t({ id: 'fluminense', nome: 'Fluminense', aliases: ['flu', 'fluzao'], fundo: '#12060b', primaria: '#7A0026', secundaria: '#00913F', terciaria: '#FFFFFF', destaque: '#1E8F5C', contorno: '#7A0F2B', padrao: 'listras', larg: 52 }),
  t({ id: 'gremio', nome: 'Grêmio', aliases: ['gremio', 'imortal'], fundo: '#07101a', primaria: '#0D80BF', secundaria: '#0B0B0B', terciaria: '#FFFFFF', destaque: '#3FA0E0', contorno: '#1D5E8C', padrao: 'listras', larg: 52 }),
  t({ id: 'internacional', nome: 'Internacional', aliases: ['inter', 'colorado', 'sc internacional', 'inter de porto alegre'], fundo: '#120809', primaria: '#E5050F', secundaria: '#FFFFFF', destaque: '#EF3B3F', contorno: '#93191D', padrao: 'liso' }),
  t({ id: 'cruzeiro', nome: 'Cruzeiro', aliases: ['raposa', 'cruzeiro ec'], fundo: '#070c18', primaria: '#0A3FA8', secundaria: '#FFFFFF', destaque: '#3B6FD4', contorno: '#1C3F8C', padrao: 'liso' }),
  t({ id: 'atletico-mg', nome: 'Atlético-MG', aliases: ['=atletico', 'atletico mg', 'atletico mineiro', 'galo', 'clube atletico mineiro'], fundo: '#0b0b0c', primaria: '#F5F5F5', secundaria: '#0A0A0A', destaque: '#DADADA', contorno: '#6F6F6F', padrao: 'listras', larg: 84 }),
  t({ id: 'athletico-pr', nome: 'Athletico-PR', aliases: ['athletico', 'athletico pr', 'atletico pr', 'furacao', 'cap'], fundo: '#110809', primaria: '#C8102E', secundaria: '#0B0B0B', destaque: '#E03B4B', contorno: '#8B1E28', padrao: 'listras', larg: 56 }),
  t({ id: 'bahia', nome: 'Bahia', aliases: ['esquadrao', 'ec bahia'], fundo: '#070d15', primaria: '#0057B8', secundaria: '#E4002B', terciaria: '#FFFFFF', destaque: '#2F7DC4', contorno: '#1A4E7E', padrao: 'listras', larg: 70 }),
  t({ id: 'vitoria', nome: 'Vitória', aliases: ['vitoria', 'vitoria ba', 'ec vitoria', 'leao da barra'], fundo: '#120607', primaria: '#D71920', secundaria: '#0B0B0B', destaque: '#FF5A5F', padrao: 'aros', larg: 40 }),
  t({ id: 'sport', nome: 'Sport', aliases: ['sport recife', 'leao da ilha'], fundo: '#110809', primaria: '#D8141E', secundaria: '#0B0B0B', destaque: '#E0342C', contorno: '#8E1B17', padrao: 'metades' }),
  t({ id: 'nautico', nome: 'Náutico', aliases: ['nautico', 'timbu'], fundo: '#130607', primaria: '#D71920', secundaria: '#FFFFFF', destaque: '#FF5A5F', padrao: 'aros', larg: 46 }),
  t({ id: 'fortaleza', nome: 'Fortaleza', aliases: ['fortaleza ec', 'leao do pici'], fundo: '#070c16', primaria: '#0A3D91', secundaria: '#D71920', terciaria: '#FFFFFF', destaque: '#3C7BD0', contorno: '#1D4A8C', padrao: 'listras', larg: 56 }),
  t({ id: 'ceara', nome: 'Ceará', aliases: ['ceara', 'vozao', 'ceara sc'], fundo: '#0b0b0c', primaria: '#F5F5F5', secundaria: '#0A0A0A', destaque: '#D8D8D8', contorno: '#6B6B6B', padrao: 'aros', larg: 50 }),
  t({ id: 'goias', nome: 'Goiás', aliases: ['goias', 'esmeraldino', 'goias ec'], fundo: '#06120c', primaria: '#0B7D3B', secundaria: '#FFFFFF', destaque: '#1FA45F', contorno: '#0F6339', padrao: 'liso' }),
  t({ id: 'coritiba', nome: 'Coritiba', aliases: ['coxa', 'coritiba fc'], fundo: '#04140A', primaria: '#0B7D3B', secundaria: '#FFFFFF', destaque: '#5CE08F', padrao: 'listras', larg: 48 }),
  t({ id: 'bragantino', nome: 'Bragantino', aliases: ['red bull bragantino', 'massa bruta'], fundo: '#0A0A0A', primaria: '#F5F5F5', secundaria: '#D71920', destaque: '#F5F5F5', padrao: 'faixa' }),
  t({ id: 'cuiaba', nome: 'Cuiabá', aliases: ['cuiaba', 'dourado'], fundo: '#04140A', primaria: '#0B7D3B', secundaria: '#F5C800', destaque: '#FFD84A', padrao: 'liso' }),
  t({ id: 'mirassol', nome: 'Mirassol', aliases: ['leao da alta paulista'], fundo: '#141004', primaria: '#F5C800', secundaria: '#0B7D3B', destaque: '#FFD84A', padrao: 'metades' }),
  t({ id: 'remo', nome: 'Remo', aliases: ['clube do remo', 'leao azul'], fundo: '#040C1C', primaria: '#0A3D91', secundaria: '#FFFFFF', destaque: '#6AA2FF', padrao: 'listras', larg: 56 }),
  t({ id: 'paysandu', nome: 'Paysandu', aliases: ['papao da curuzu', 'papao'], fundo: '#040C1C', primaria: '#1E6FD9', secundaria: '#FFFFFF', destaque: '#78B0FF', padrao: 'metades' }),
  t({ id: 'chapecoense', nome: 'Chapecoense', aliases: ['chape', 'chapecoense sc'], fundo: '#04140A', primaria: '#0B7D3B', secundaria: '#FFFFFF', destaque: '#5CE08F', padrao: 'liso' }),
  t({ id: 'selecao', nome: 'Seleção Brasileira', aliases: ['selecao', 'selecao brasileira', '=brasil', 'cbf'], fundo: '#04140A', primaria: '#F5C800', secundaria: '#0B7D3B', terciaria: '#0A3D91', destaque: '#FFD84A', padrao: 'faixa' }),
  // ── Fora do país (os mais citados) ─────────────────────────────────────────
  t({ id: 'real-madrid', nome: 'Real Madrid', aliases: ['=real'], fundo: '#0A0A12', primaria: '#FFFFFF', secundaria: '#FEBE10', destaque: '#FEDA55', padrao: 'liso' }),
  t({ id: 'barcelona', nome: 'Barcelona', aliases: ['barca', 'fc barcelona'], fundo: '#060A1A', primaria: '#A50044', secundaria: '#004D98', destaque: '#F0C24B', padrao: 'listras', larg: 54 }),
  t({ id: 'manchester-united', nome: 'Manchester United', aliases: ['man united'], fundo: '#160606', primaria: '#DA291C', secundaria: '#FBE122', destaque: '#FBE122', padrao: 'liso' }),
  t({ id: 'liverpool', nome: 'Liverpool', aliases: ['liverpool fc'], fundo: '#160606', primaria: '#C8102E', secundaria: '#00B2A9', destaque: '#FF5A6A', padrao: 'liso' }),
  t({ id: 'psg', nome: 'PSG', aliases: ['paris saint germain', '=paris'], fundo: '#040814', primaria: '#004170', secundaria: '#DA291C', destaque: '#7DB5F0', padrao: 'faixa' }),
  t({ id: 'boca', nome: 'Boca Juniors', aliases: ['boca'], fundo: '#040A1C', primaria: '#0A2A6B', secundaria: '#F5C800', destaque: '#F5C800', padrao: 'faixa' }),
  t({ id: 'river', nome: 'River Plate', aliases: ['river'], fundo: '#0A0A0A', primaria: '#F5F5F5', secundaria: '#E4002B', destaque: '#FF4D5E', padrao: 'faixa' }),
  t({ id: 'milan', nome: 'Milan', aliases: ['ac milan'], fundo: '#140606', primaria: '#D71920', secundaria: '#0B0B0B', destaque: '#FF5A5F', padrao: 'listras', larg: 56 }),
  t({ id: 'inter-milao', nome: 'Inter de Milão', aliases: ['inter de milao', 'internazionale', 'inter milan'], fundo: '#04091C', primaria: '#0A3D91', secundaria: '#0B0B0B', destaque: '#6AA2FF', padrao: 'listras', larg: 56 }),
  t({ id: 'bayern', nome: 'Bayern de Munique', aliases: ['bayern', 'bayern munique', 'bayern de munich'], fundo: '#140606', primaria: '#DC052D', secundaria: '#0066B2', destaque: '#FF5A70', padrao: 'liso' }),
];

/** nomes para o autocomplete do campo "time do coração" */
export const NOMES_TIMES: string[] = TEMAS.map((x) => x.nome);

/** minúsculas, sem acento, só letras/números separados por espaço */
export function normalizarTime(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Chave {
  chave: string;
  /** só vale se a entrada for exatamente isso (apelidos curtos/ambíguos) */
  exata: boolean;
  tema: TemaTime;
}

const CHAVES: Chave[] = TEMAS.flatMap((tema) =>
  [tema.nome, tema.id, ...tema.aliases].map((n) => {
    const exata = n.startsWith('=');
    return { chave: normalizarTime(exata ? n.slice(1) : n), exata, tema };
  }),
).filter((c) => c.chave.length > 0);

/**
 * Acha o tema pelo que a pessoa digitou. Primeiro igualdade exata (com
 * apelidos), depois "contém como palavra" — só para chaves com 5+ letras e
 * não marcadas como exatas (prefixo "=" no alias), pra "fla" ou "atletico"
 * não casarem no meio de outros nomes.
 */
export function acharTime(entrada: string | null | undefined): TemaTime | null {
  const q = normalizarTime(entrada ?? '');
  if (!q) return null;

  const exato = CHAVES.find((c) => c.chave === q);
  if (exato) return exato.tema;

  const cercado = ` ${q} `;
  let melhor: Chave | null = null;
  for (const c of CHAVES) {
    if (c.exata || c.chave.length < 5) continue;
    if (cercado.includes(` ${c.chave} `) && (!melhor || c.chave.length > melhor.chave.length)) {
      melhor = c;
    }
  }
  return melhor?.tema ?? null;
}

/** sigla curta pro escudo: iniciais se tem várias palavras, senão 3 letras */
export function siglaTime(tema: TemaTime): string {
  const palavras = normalizarTime(tema.nome).split(' ').filter(Boolean);
  const sigla =
    palavras.length > 1 ? palavras.map((w) => w[0]).join('').slice(0, 3) : (palavras[0] ?? '').slice(0, 3);
  return sigla.toUpperCase();
}

export function temaDoTime(entrada: string | null | undefined): TemaTime {
  return acharTime(entrada) ?? TEMA_PADRAO;
}

// ── cores ────────────────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** mistura `a` com `b`: t=0 → a, t=1 → b */
export function misturarHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[m(ar, br), m(ag, bg), m(ab, bb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbaHex(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** razão de contraste WCAG entre duas cores */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── compat com a cartinha em escudo ──────────────────────────────────────────

/** Cores que a carta usa: número/nome (brilho), base escura e traço interno. */
export interface CoresTime {
  brilho: string;
  fundo: string;
  contorno: string;
}

export const CORES_PADRAO: CoresTime = {
  brilho: TEMA_PADRAO.destaque,
  fundo: TEMA_PADRAO.fundo,
  contorno: TEMA_PADRAO.contorno ?? '#B9902F',
};

export function coresDoTemaTime(t: TemaTime): CoresTime {
  return {
    brilho: t.destaque,
    fundo: t.fundo,
    contorno: t.contorno ?? misturarHex(t.destaque, '#000000', 0.42),
  };
}

/** Cores do time do coração; cai no dourado da casa quando não reconhece. */
export function coresDoTime(time?: string | null): CoresTime {
  return coresDoTemaTime(temaDoTime(time));
}
