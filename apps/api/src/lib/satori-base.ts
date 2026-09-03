import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);

export const PALETA = {
  ouro: '#E7C158',
  ouroEscuro: '#B9902F',
  creme: '#F3EEDF',
  dim: '#8C7C4E',
  fundo: '#0d0d0e',
};

let fontesCache:
  | { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: 'normal' }[]
  | null = null;

export async function fontes() {
  if (fontesCache) return fontesCache;
  const f = (pkg: string, file: string) => readFile(require.resolve(`${pkg}/files/${file}`));
  fontesCache = [
    { name: 'Barlow', data: await f('@fontsource/barlow', 'barlow-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Barlow', data: await f('@fontsource/barlow', 'barlow-latin-600-normal.woff'), weight: 600, style: 'normal' },
    { name: 'Barlow Condensed', data: await f('@fontsource/barlow-condensed', 'barlow-condensed-latin-700-normal.woff'), weight: 700, style: 'normal' },
    { name: 'Barlow Condensed', data: await f('@fontsource/barlow-condensed', 'barlow-condensed-latin-800-normal.woff'), weight: 800, style: 'normal' },
  ];
  return fontesCache;
}

/** cria elemento no formato que o satori aceita, sem JSX no build da API */
export type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
export function h(type: string, props: Record<string, unknown>, ...children: unknown[]): El {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

export async function elementoParaPng(
  elemento: El,
  opts: { width: number; height?: number },
): Promise<Buffer> {
  const svg = await satori(elemento as unknown as Parameters<typeof satori>[0], {
    width: opts.width,
    ...(opts.height ? { height: opts.height } : {}),
    fonts: await fontes(),
  });
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: 'width', value: opts.width } }).render().asPng(),
  );
}
