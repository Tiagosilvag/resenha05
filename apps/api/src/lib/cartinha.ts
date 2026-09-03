import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ATRIBUTOS,
  ROTULO_ATRIBUTO,
  calcularAtributos,
  selo,
  seloPe,
  type EntradaCartinha,
  type Posicao,
} from '@resenha05/shared';
import { UPLOADS_DIR } from './uploads.js';
import { PALETA, h, elementoParaPng } from './satori-base.js';

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
  pePreferido?: string | null;
}

const L = 720;
const A = 1010;

export async function renderCartinhaPng(dados: DadosCartinha): Promise<Buffer> {
  const at = calcularAtributos(dados);
  const foto = await fotoDataUri(dados.fotoUrl);
  const nome = (dados.nome ?? 'Jogador').toUpperCase();
  const pos = selo(dados.posicao as Posicao | null);
  const pe = seloPe(dados.pePreferido);
  const estrelas = Math.min(5, Math.max(1, Math.round(dados.estrelas || 3)));

  const stat = (a: (typeof ATRIBUTOS)[number]) =>
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '33%' } },
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 24, color: OURO, letterSpacing: 2 } }, ROTULO_ATRIBUTO[a]),
      h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 52, color: CRE, lineHeight: 1 } }, String(at[a])),
    );

  const arvore = h(
    'div',
    {
      style: {
        width: L,
        height: A,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 46,
        color: CRE,
        fontFamily: 'Barlow',
        backgroundColor: '#0d0d0e',
        backgroundImage:
          'radial-gradient(circle at 50% 15%, #2c2510 0%, #14130f 48%, #0a0a0b 100%), linear-gradient(125deg, rgba(231,193,88,0.10) 0%, rgba(231,193,88,0) 38%, rgba(231,193,88,0) 62%, rgba(231,193,88,0.08) 100%)',
        border: `6px solid ${OURO_ESCURO}`,
        borderRadius: 40,
      },
    },
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' } },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' } },
        h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 128, color: OURO, lineHeight: 0.9 } }, String(at.overall)),
        h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 34, color: OURO, letterSpacing: 4, marginTop: 4 } }, pos),
        h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 24, color: DIM, letterSpacing: 3, marginTop: 6 } }, `PÉ ${pe}`),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 96,
            height: 96,
            borderRadius: 999,
            border: `4px solid ${OURO}`,
            backgroundColor: '#15140f',
            fontFamily: 'Barlow Condensed',
            fontWeight: 800,
            fontSize: 44,
            color: OURO,
          },
        },
        'R5',
      ),
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          marginTop: 18,
          width: 300,
          height: 300,
          borderRadius: 999,
          border: `5px solid ${OURO}`,
          backgroundColor: '#15140f',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
      },
      foto
        ? h('img', { src: foto, width: 300, height: 300, style: { objectFit: 'cover' } })
        : h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 96, color: OURO } }, 'R5'),
    ),
    h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 60, color: OURO, marginTop: 20, textAlign: 'center' } }, nome),
    h('span', { style: { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 22, color: DIM, letterSpacing: 3 } }, 'RESENHA 05'),
    h('div', { style: { display: 'flex', width: 460, height: 3, backgroundColor: OURO_ESCURO, marginTop: 18, marginBottom: 18 } }),
    h('div', { style: { display: 'flex', width: '100%', justifyContent: 'space-between', marginBottom: 26 } }, ...ATRIBUTOS.slice(0, 3).map(stat)),
    h('div', { style: { display: 'flex', width: '100%', justifyContent: 'space-between' } }, ...ATRIBUTOS.slice(3).map(stat)),
    h(
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
    ),
  );

  return elementoParaPng(arvore, { width: L, height: A });
}
