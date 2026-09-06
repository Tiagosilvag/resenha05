import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ATRIBUTOS_CARTA,
  coresDoTime,
  ROTULO_ATRIBUTO,
  calcularAtributos,
  selo,
  seloPe,
  type EntradaCartinha,
  type Posicao,
} from '@resenha05/shared';
import { UPLOADS_DIR } from './uploads.js';
import { PALETA, h, elementoParaPng, logoDataUri, type El } from './satori-base.js';

const { creme: CRE, dim: DIM } = PALETA;

/** #RRGGBB + alfa -> rgba(), para os detalhes de fundo seguirem a cor do time. */
function comAlfa(hex: string, alfa: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

async function fotoDataUri(fotoUrl: string | null): Promise<string | null> {
  if (!fotoUrl) return null;
  const rel = fotoUrl.replace(/^\/api\/uploads\//, '');
  if (rel.includes('..')) return null;
  try {
    const buf = await readFile(join(UPLOADS_DIR, rel));
    const ext = rel.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export interface DadosCartinha extends EntradaCartinha {
  nome: string | null;
  fotoUrl: string | null;
  fotoRecortada?: boolean;
  pePreferido?: string | null;
  /** Time do coração — define as cores da carta. */
  timeCoracao?: string | null;
}

const L = 720;
const A = 1010;

/**
 * Silhueta de brasão: ombros retos, base afunilando até a ponta. É a moldura
 * da carta inteira — o conteúdo tem que caber na parte larga, de cima.
 */
const ESCUDO = [
  'M 26 46',
  'Q 26 14 62 14',
  'L 658 14',
  'Q 694 14 694 46',
  'L 694 606',
  'C 694 806 566 918 360 996',
  'C 154 918 26 806 26 606',
  'Z',
].join(' ');

export async function renderCartinhaPng(dados: DadosCartinha): Promise<Buffer> {
  const at = calcularAtributos(dados);
  const foto = await fotoDataUri(dados.fotoUrl);
  const logo = await logoDataUri();
  const recortada = Boolean(dados.fotoRecortada && foto);
  const nome = (dados.nome ?? 'Jogador').toUpperCase();
  const pos = selo(dados.posicao as Posicao | null);
  const pe = seloPe(dados.pePreferido);
  const estrelas = Math.min(5, Math.max(1, Math.round(dados.estrelas || 3)));
  const { brilho, fundo, contorno } = coresDoTime(dados.timeCoracao);

  const stat = (a: (typeof ATRIBUTOS_CARTA)[number]): El =>
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '25%' } },
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 21, color: brilho, letterSpacing: 1 } }, ROTULO_ATRIBUTO[a]),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 46, color: CRE, lineHeight: 1 } }, String(at[a])),
    );

  const camadaAbsoluta = (...filhos: El[]): El =>
    h(
      'div',
      { style: { position: 'absolute', top: 0, left: 0, width: L, height: A, display: 'flex' } },
      ...filhos,
    );

  // Detalhes do fundo — ficam atrás da foto (que, recortada, é transparente
  // em volta do jogador) para a carta não ficar num vazio chapado.
  const fundoDetalhes: El = camadaAbsoluta(
    // anéis de "holofote" atrás do jogador
    ...[
      { d: 604, x: 58, y: 150, cor: comAlfa(brilho, 0.11) },
      { d: 430, x: 145, y: 237, cor: comAlfa(brilho, 0.07) },
    ].map(({ d, x, y, cor }) =>
      h('div', {
        style: {
          position: 'absolute',
          display: 'flex',
          left: x,
          top: y,
          width: d,
          height: d,
          borderRadius: d / 2,
          border: `2px solid ${cor}`,
        },
      }),
    ),
    // faixas diagonais, no mesmo espírito do fundo do app
    ...Array.from({ length: 9 }, (_, i) =>
      h('div', {
        style: {
          position: 'absolute',
          display: 'flex',
          left: -250 + i * 118,
          top: -300,
          width: 36,
          height: 1620,
          transform: 'rotate(-22deg)',
          backgroundColor: comAlfa(brilho, i % 2 === 0 ? 0.055 : 0.025),
        },
      }),
    ),
    // brasão em marca d'água
    h('img', {
      src: logo,
      style: { position: 'absolute', left: 162, top: 232, width: 396, height: 594, opacity: 0.035 },
    }),
  );

  // Cantoneiras douradas por cima de tudo — moldura dupla, sem cobrir a foto.
  const cantoneiras: El = camadaAbsoluta(
    ...(
      [
        { top: 26, left: 26, lados: { borderTop: true, borderLeft: true } },
        { top: 26, right: 26, lados: { borderTop: true, borderRight: true } },
        { bottom: 26, left: 26, lados: { borderBottom: true, borderLeft: true } },
        { bottom: 26, right: 26, lados: { borderBottom: true, borderRight: true } },
      ] as const
    ).map(({ lados, ...pos }) =>
      h('div', {
        style: {
          position: 'absolute',
          display: 'flex',
          width: 58,
          height: 58,
          ...pos,
          ...Object.fromEntries(
            Object.keys(lados).map((lado) => [lado, `3px solid ${comAlfa(brilho, 0.45)}`]),
          ),
        },
      }),
    ),
  );

  // Foto: recortada = jogador "saindo" da moldura (estilo FUT), preenchendo
  // a carta atrás dos números; senão = janela grande se fundindo à carta.
  const camadaFoto: El = recortada
    ? h(
        'div',
        {
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: L - 12,
            height: A - 12,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            overflow: 'hidden',
            borderRadius: 34,
          },
        },
        h('img', { src: foto!, style: { height: 858, objectFit: 'contain' } }),
        // scrim de topo — mantém OVR/posição/brasão legíveis sobre qualquer foto
        h('div', {
          style: {
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: L - 12,
            height: 320,
            backgroundImage:
              'linear-gradient(to bottom, rgba(10,10,11,0.72) 0%, rgba(10,10,11,0.28) 50%, rgba(10,10,11,0) 100%)',
          },
        }),
        // scrim inferior — os pés do jogador dissolvem na placa de nome
        h('div', {
          style: {
            display: 'flex',
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: L - 12,
            height: 500,
            backgroundImage:
              'linear-gradient(to top, #0b0b0c 0%, rgba(11,11,12,0.97) 24%, rgba(11,11,12,0.72) 48%, rgba(11,11,12,0.3) 74%, rgba(11,11,12,0) 100%)',
          },
        }),
      )
    : h(
        'div',
        {
          style: {
            position: 'relative',
            display: 'flex',
            marginTop: 4,
            width: 500,
            height: 400,
            borderRadius: 22,
            border: `2px solid ${contorno}`,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#15140f',
          },
        },
        ...(foto
          ? [
              h('img', {
                src: foto,
                style: { position: 'absolute', top: 0, left: 0, width: 500, height: 400, objectFit: 'cover' },
              }),
              h('div', {
                style: {
                  display: 'flex',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 500,
                  height: 400,
                  backgroundImage:
                    'linear-gradient(to bottom, rgba(13,13,14,0.95) 0%, rgba(13,13,14,0) 20%, rgba(13,13,14,0) 55%, rgba(13,13,14,0.98) 100%), linear-gradient(to right, rgba(13,13,14,0.7) 0%, rgba(13,13,14,0) 14%, rgba(13,13,14,0) 86%, rgba(13,13,14,0.7) 100%)',
                },
              }),
            ]
          : [h('img', { src: logo, style: { height: 300, width: 200, opacity: 0.9 } })]),
      );

  const topo: El = h(
    'div',
    { style: { display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start', position: 'relative' } },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' } },
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 110, color: brilho, lineHeight: 0.9, textShadow: '0 4px 14px rgba(0,0,0,0.85)' } }, String(at.overall)),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 32, color: brilho, letterSpacing: 4, marginTop: 4, textShadow: '0 2px 8px rgba(0,0,0,0.85)' } }, pos),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 22, color: recortada ? CRE : DIM, letterSpacing: 3, marginTop: 5, textShadow: '0 2px 8px rgba(0,0,0,0.85)' } }, `PÉ ${pe}`),
    ),
    h('img', { src: logo, style: { display: 'flex', height: 132, width: 88 } }),
  );

  const rodape: El = h(
    'div',
    { style: { display: 'flex', gap: 14, marginTop: 'auto' } },
    ...Array.from({ length: 5 }, (_, i) =>
      h('div', {
        key: i,
        style: {
          display: 'flex',
          width: 18,
          height: 18,
          transform: 'rotate(45deg)',
          backgroundColor: i < estrelas ? brilho : 'transparent',
          border: `2px solid ${i < estrelas ? brilho : comAlfa(brilho, 0.35)}`,
        },
      }),
    ),
  );

  const bloco = (children: El[]): El =>
    h(
      'div',
      {
        style: {
          width: L,
          height: A,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 46,
          // A ponta do escudo come as laterais embaixo: o conteúdo para antes.
          paddingBottom: 168,
          position: 'relative',
          color: CRE,
          fontFamily: 'Barlow',
          backgroundColor: fundo,
          backgroundImage: [
            `radial-gradient(circle at 50% 15%, ${comAlfa(brilho, 0.3)} 0%, ${comAlfa(brilho, 0.06)} 46%, ${comAlfa(brilho, 0)} 100%)`,
            `linear-gradient(125deg, ${comAlfa(brilho, 0.1)} 0%, ${comAlfa(brilho, 0)} 38%, ${comAlfa(brilho, 0)} 62%, ${comAlfa(brilho, 0.08)} 100%)`,
          ].join(', '),
          // A moldura vem do recorte de escudo (envolverSvg), não da borda.
          overflow: 'hidden',
        },
      },
      ...children,
    );

  const infoInferior: El[] = [
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: recortada ? 0 : 14 } },
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 54, color: brilho, textAlign: 'center', lineHeight: 1 } }, nome),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 20, color: DIM, letterSpacing: 3, marginTop: 6 } }, 'RESENHA 05'),
    ),
    h('div', { style: { display: 'flex', width: 430, height: 3, backgroundColor: contorno, marginTop: 16, marginBottom: 14 } }),
    h('div', { style: { display: 'flex', width: 430, justifyContent: 'space-between', marginBottom: 20 } }, ...ATRIBUTOS_CARTA.map(stat)),
    rodape,
  ];

  const conteudoRecortado = h(
    'div',
    {
      style: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        flexGrow: 1,
      },
    },
    topo,
    h('div', { style: { display: 'flex', flexGrow: 1 } }),
    ...infoInferior,
  );

  const arvore = recortada
    ? bloco([fundoDetalhes, camadaFoto, conteudoRecortado, cantoneiras])
    : bloco([fundoDetalhes, topo, camadaFoto, ...infoInferior, cantoneiras]);

  return elementoParaPng(arvore, {
    width: L,
    height: A,
    // O satori não recorta em forma livre: a carta é montada retangular e o
    // escudo é aplicado aqui, junto com a moldura na cor do time.
    envolverSvg: (svgInterno) =>
      [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">`,
        `<defs><clipPath id="escudo"><path d="${ESCUDO}"/></clipPath></defs>`,
        `<g clip-path="url(#escudo)">${svgInterno}</g>`,
        `<path d="${ESCUDO}" fill="none" stroke="${contorno}" stroke-width="16" stroke-linejoin="round"/>`,
        `<path d="${ESCUDO}" fill="none" stroke="${brilho}" stroke-width="5" stroke-linejoin="round"/>`,
        '</svg>',
      ].join(''),
  });
}
