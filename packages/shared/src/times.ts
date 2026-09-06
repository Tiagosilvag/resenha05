/**
 * Cores dos times do coração, para a cartinha sair na cara do time da pessoa.
 *
 * São só as cores (fatos públicos de cada clube) — nada de escudo ou marca de
 * terceiro: o formato de escudo da carta é um brasão genérico nosso.
 *
 * `brilho` é a cor viva do clube (moldura, número, nome), `fundo` é a base
 * escura da carta e `contorno` é o traço interno. Tudo é conferido contra o
 * creme do texto, então nenhum time pode devolver um fundo claro.
 */
export interface CoresTime {
  brilho: string;
  fundo: string;
  contorno: string;
}

export const CORES_PADRAO: CoresTime = {
  brilho: '#E7C158',
  fundo: '#0d0d0e',
  contorno: '#B9902F',
};

const CORES: Record<string, CoresTime> = {
  flamengo: { brilho: '#E23D28', fundo: '#120a08', contorno: '#8C1A0F' },
  corinthians: { brilho: '#D7D7D7', fundo: '#0c0c0d', contorno: '#7A7A7A' },
  palmeiras: { brilho: '#1D9E5E', fundo: '#06120c', contorno: '#0C5C36' },
  'são paulo': { brilho: '#E03A3E', fundo: '#100a0b', contorno: '#8E1F22' },
  'sao paulo': { brilho: '#E03A3E', fundo: '#100a0b', contorno: '#8E1F22' },
  vasco: { brilho: '#E8E8E8', fundo: '#0b0b0c', contorno: '#6F6F6F' },
  grêmio: { brilho: '#3FA0E0', fundo: '#07101a', contorno: '#1D5E8C' },
  gremio: { brilho: '#3FA0E0', fundo: '#07101a', contorno: '#1D5E8C' },
  internacional: { brilho: '#EF3B3F', fundo: '#120809', contorno: '#93191D' },
  cruzeiro: { brilho: '#3B6FD4', fundo: '#070c18', contorno: '#1C3F8C' },
  'atlético-mg': { brilho: '#DADADA', fundo: '#0b0b0c', contorno: '#6F6F6F' },
  'atletico-mg': { brilho: '#DADADA', fundo: '#0b0b0c', contorno: '#6F6F6F' },
  santos: { brilho: '#E4E4E4', fundo: '#0c0c0c', contorno: '#767676' },
  botafogo: { brilho: '#DCDCDC', fundo: '#0a0a0a', contorno: '#6C6C6C' },
  fluminense: { brilho: '#1E8F5C', fundo: '#12060b', contorno: '#7A0F2B' },
  bahia: { brilho: '#2F7DC4', fundo: '#070d15', contorno: '#1A4E7E' },
  sport: { brilho: '#E0342C', fundo: '#110809', contorno: '#8E1B17' },
  'athletico-pr': { brilho: '#E03B4B', fundo: '#110809', contorno: '#8B1E28' },
  fortaleza: { brilho: '#3C7BD0', fundo: '#070c16', contorno: '#1D4A8C' },
  ceará: { brilho: '#D8D8D8', fundo: '#0b0b0c', contorno: '#6B6B6B' },
  ceara: { brilho: '#D8D8D8', fundo: '#0b0b0c', contorno: '#6B6B6B' },
  goiás: { brilho: '#1FA45F', fundo: '#06120c', contorno: '#0F6339' },
  goias: { brilho: '#1FA45F', fundo: '#06120c', contorno: '#0F6339' },
};

/** Cores do time do coração; cai no dourado da casa quando não reconhece. */
export function coresDoTime(time?: string | null): CoresTime {
  if (!time) return CORES_PADRAO;
  return CORES[time.trim().toLowerCase()] ?? CORES_PADRAO;
}
