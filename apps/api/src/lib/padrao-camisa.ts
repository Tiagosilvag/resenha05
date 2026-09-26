import { luminancia, rgbaHex, type TemaTime } from '@resenha05/shared';

/** intensidade do padrão conforme a cor: claras ficam suaves, escuras escurecem */
function alfaDaCor(hex: string): number {
  const l = luminancia(hex);
  if (l > 0.5) return 0.15;
  if (l > 0.08) return 0.27;
  return 0.42;
}

/**
 * Gradiente que lembra a camisa do time (listras, aros, metades, faixa).
 * null quando o desenho é liso.
 */
export function gradientePadrao(t: TemaTime): string | null {
  const cores = [t.primaria, t.secundaria, t.terciaria].filter((c): c is string => Boolean(c));
  const cs = cores.map((c) => rgbaHex(c, alfaDaCor(c)));
  const w = t.larg ?? 60;

  switch (t.padrao) {
    case 'listras':
    case 'aros': {
      const dir = t.padrao === 'listras' ? '90deg' : '180deg';
      const paradas = cs.map((c, i) => `${c} ${i * w}px, ${c} ${(i + 1) * w}px`).join(', ');
      return `repeating-linear-gradient(${dir}, ${paradas})`;
    }
    case 'metades':
      return `linear-gradient(90deg, ${cs[0]} 0%, ${cs[0]} 50%, ${cs[1]} 50%, ${cs[1]} 100%)`;
    case 'faixa':
      // camisa da cor primária com uma faixa diagonal da secundária
      return `linear-gradient(112deg, ${cs[0]} 0%, ${cs[0]} 30%, ${cs[1]} 30%, ${cs[1]} 54%, ${cs[0]} 54%, ${cs[0]} 100%)`;
    default:
      return null;
  }
}
