import { PALETA, h, elementoParaPng, logoDataUri, type El } from './satori-base.js';

const { ouro: OURO, ouroEscuro: OURO_ESCURO, creme: CRE, dim: DIM } = PALETA;

export interface TimeArte {
  numero: number;
  nome?: string | null;
  totalEstrelas: number;
  jogadores: { nome: string | null; estrelas: number }[];
}

export interface DadosSorteioArte {
  organizacao: string;
  quando: string;
  times: TimeArte[];
  amplitude: number;
}

const L = 640;
const PAD = 40;

/** losango dourado (evita depender de glyph de estrela na fonte) */
function diamante(tamanho: number, preenchido = true): El {
  return h('div', {
    style: {
      display: 'flex',
      width: tamanho,
      height: tamanho,
      transform: 'rotate(45deg)',
      backgroundColor: preenchido ? OURO : 'transparent',
      border: `1.5px solid ${preenchido ? OURO : DIM}`,
    },
  });
}

function badgeEstrelas(n: number): El {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 6 } },
    diamante(11),
    h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 22, color: OURO } }, String(Math.round(n))),
  );
}

export async function renderSorteioArtePng(d: DadosSorteioArte): Promise<Buffer> {
  const logo = await logoDataUri();
  const gapCard = 16;
  const alturaDe = (t: TimeArte) => 54 + t.jogadores.length * 42 + 12;
  const somaCards = d.times.reduce((s, t) => s + alturaDe(t) + gapCard, -gapCard);
  const altura = PAD * 2 + 252 + 28 + somaCards + 28 + 60;

  const cartaTime = (t: TimeArte): El =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          borderRadius: 18,
          border: `2px solid ${OURO_ESCURO}`,
          backgroundColor: '#131210',
          overflow: 'hidden',
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 18px',
            backgroundColor: '#1d1a12',
          },
        },
        h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 32, color: OURO, letterSpacing: 2 } }, t.nome ?? `TIME ${t.numero}`),
        badgeEstrelas(t.totalEstrelas),
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', padding: '6px 18px 12px' } },
        ...t.jogadores.map((j, i) =>
          h(
            'div',
            {
              key: i,
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: 42,
                borderBottom: i < t.jogadores.length - 1 ? '1px solid #2a2720' : 'none',
              },
            },
            h('span', { style: { fontFamily: 'Barlow', fontWeight: 600, fontSize: 23, color: CRE } }, j.nome ?? 'Jogador'),
            h('div', { style: { display: 'flex', gap: 3 } }, ...Array.from({ length: 5 }, (_, s) => diamante(9, s < Math.round(j.estrelas)))),
          ),
        ),
      ),
    );

  const arvore = h(
    'div',
    {
      style: {
        width: L,
        height: altura,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: PAD,
        fontFamily: 'Barlow',
        color: CRE,
        backgroundColor: '#0d0d0e',
        backgroundImage: 'radial-gradient(circle at 50% 8%, #2c2510 0%, #14130f 46%, #0a0a0b 100%)',
        border: `6px solid ${OURO_ESCURO}`,
        borderRadius: 34,
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
      h('img', { src: logo, style: { display: 'flex', height: 96, width: 64, marginBottom: 6 } }),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 20, color: OURO, letterSpacing: 5 } }, 'SORTEIO DE TIMES'),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 42, color: OURO, marginTop: 2, textAlign: 'center', lineHeight: 1 } }, d.organizacao.toUpperCase()),
      h('span', { style: { fontFamily: 'Barlow', fontWeight: 600, fontSize: 21, color: DIM, marginTop: 4 } }, d.quando),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: gapCard, width: '100%', marginTop: 28 } },
      ...d.times.map(cartaTime),
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 30 } },
      h('img', { src: logo, style: { display: 'flex', height: 54, width: 36 } }),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 22, color: DIM, letterSpacing: 2 } },
        `DIFERENÇA ENTRE OS TIMES: ${d.amplitude} `),
      diamante(12),
    ),
  );

  return elementoParaPng(arvore, { width: L, height: altura });
}
