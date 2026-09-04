import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ATRIBUTOS_CARTA,
  ROTULO_ATRIBUTO,
  calcularAtributos,
  selo,
  seloPe,
  type EntradaCartinha,
  type Posicao,
} from '@resenha05/shared';
import { UPLOADS_DIR } from './uploads.js';
import { PALETA, h, elementoParaPng, logoDataUri, type El } from './satori-base.js';

const { ouro: OURO, ouroEscuro: OURO_ESCURO, creme: CRE, dim: DIM } = PALETA;

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
}

const L = 720;
const A = 1010;

export async function renderCartinhaPng(dados: DadosCartinha): Promise<Buffer> {
  const at = calcularAtributos(dados);
  const foto = await fotoDataUri(dados.fotoUrl);
  const logo = await logoDataUri();
  const recortada = Boolean(dados.fotoRecortada && foto);
  const nome = (dados.nome ?? 'Jogador').toUpperCase();
  const pos = selo(dados.posicao as Posicao | null);
  const pe = seloPe(dados.pePreferido);
  const estrelas = Math.min(5, Math.max(1, Math.round(dados.estrelas || 3)));

  const stat = (a: (typeof ATRIBUTOS_CARTA)[number]): El =>
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '25%' } },
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 24, color: OURO, letterSpacing: 2 } }, ROTULO_ATRIBUTO[a]),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 54, color: CRE, lineHeight: 1 } }, String(at[a])),
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
      { d: 604, x: 58, y: 150, cor: 'rgba(231,193,88,0.11)' },
      { d: 430, x: 145, y: 237, cor: 'rgba(231,193,88,0.07)' },
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
          backgroundColor: i % 2 === 0 ? 'rgba(231,193,88,0.055)' : 'rgba(231,193,88,0.025)',
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
            Object.keys(lados).map((lado) => [lado, '3px solid rgba(231,193,88,0.45)']),
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
            border: `2px solid ${OURO_ESCURO}`,
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
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 110, color: OURO, lineHeight: 0.9, textShadow: '0 4px 14px rgba(0,0,0,0.85)' } }, String(at.overall)),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 32, color: OURO, letterSpacing: 4, marginTop: 4, textShadow: '0 2px 8px rgba(0,0,0,0.85)' } }, pos),
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
          backgroundColor: i < estrelas ? OURO : 'transparent',
          border: `2px solid ${i < estrelas ? OURO : DIM}`,
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
          position: 'relative',
          color: CRE,
          fontFamily: 'Barlow',
          backgroundColor: '#0d0d0e',
          backgroundImage:
            'radial-gradient(circle at 50% 15%, #2c2510 0%, #14130f 48%, #0a0a0b 100%), linear-gradient(125deg, rgba(231,193,88,0.10) 0%, rgba(231,193,88,0) 38%, rgba(231,193,88,0) 62%, rgba(231,193,88,0.08) 100%)',
          border: `6px solid ${OURO_ESCURO}`,
          borderRadius: 40,
          overflow: 'hidden',
        },
      },
      ...children,
    );

  const infoInferior: El[] = [
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: recortada ? 0 : 14 } },
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 54, color: OURO, textAlign: 'center', lineHeight: 1 } }, nome),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 20, color: DIM, letterSpacing: 3, marginTop: 6 } }, 'RESENHA 05'),
    ),
    h('div', { style: { display: 'flex', width: 540, height: 3, backgroundColor: OURO_ESCURO, marginTop: 16, marginBottom: 14 } }),
    h('div', { style: { display: 'flex', width: 540, justifyContent: 'space-between', marginBottom: 24 } }, ...ATRIBUTOS_CARTA.map(stat)),
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

  return elementoParaPng(arvore, { width: L, height: A });
}
