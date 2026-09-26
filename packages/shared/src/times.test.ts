import { describe, it, expect } from 'vitest';
import {
  TEMAS,
  TEMA_PADRAO,
  acharTime,
  temaDoTime,
  contraste,
  misturarHex,
  rgbaHex,
  coresDoTime,
  CORES_PADRAO,
} from './times.js';

describe('acharTime', () => {
  it('acha pelo nome, sem ligar pra acento/caixa', () => {
    expect(acharTime('Flamengo')?.id).toBe('flamengo');
    expect(acharTime('  grêmio ')?.id).toBe('gremio');
    expect(acharTime('SAO PAULO')?.id).toBe('sao-paulo');
    expect(acharTime('Atlético-MG')?.id).toBe('atletico-mg');
  });

  it('acha por apelido', () => {
    expect(acharTime('Timão')?.id).toBe('corinthians');
    expect(acharTime('fla')?.id).toBe('flamengo');
    expect(acharTime('Verdão')?.id).toBe('palmeiras');
    expect(acharTime('inter')?.id).toBe('internacional');
  });

  it('acha quando a frase contém o nome (5+ letras)', () => {
    expect(acharTime('Clube de Regatas do Vasco da Gama')?.id).toBe('vasco');
    expect(acharTime('Sou botafogo desde criança')?.id).toBe('botafogo');
  });

  it('apelido curto/ambíguo só vale exato', () => {
    expect(acharTime('Atlético Goianiense')).toBeNull();
    expect(acharTime('Paris FC')).toBeNull();
    expect(acharTime('flamboyant')).toBeNull();
  });

  it('a chave mais longa ganha (Inter de Milão ≠ Internacional)', () => {
    expect(acharTime('Inter de Milão')?.id).toBe('inter-milao');
    expect(acharTime('Inter Milan')?.id).toBe('inter-milao');
  });

  it('desconhecido/vazio → null; temaDoTime cai no padrão', () => {
    expect(acharTime('Time do Bairro')).toBeNull();
    expect(acharTime('')).toBeNull();
    expect(acharTime(null)).toBeNull();
    expect(temaDoTime('Time do Bairro')).toBe(TEMA_PADRAO);
  });
});

describe('catálogo', () => {
  it('ids únicos', () => {
    const ids = TEMAS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada nome e apelido leva ao próprio time (sem colisão)', () => {
    for (const tema of TEMAS) {
      expect(acharTime(tema.nome)?.id, tema.nome).toBe(tema.id);
      for (const a of tema.aliases) {
        expect(acharTime(a.replace(/^=/, ''))?.id, `${tema.id} / ${a}`).toBe(tema.id);
      }
    }
  });

  it('destaque tem contraste legível sobre o fundo (texto grande, 3:1)', () => {
    for (const tema of [TEMA_PADRAO, ...TEMAS]) {
      expect(contraste(tema.destaque, tema.fundo), tema.id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('coresDoTime (usada pela carta em escudo)', () => {
  it('mantém as cores que já estavam em produção', () => {
    expect(coresDoTime('Flamengo')).toEqual({ brilho: '#E23D28', fundo: '#120a08', contorno: '#8C1A0F' });
    expect(coresDoTime('  grêmio')).toEqual({ brilho: '#3FA0E0', fundo: '#07101a', contorno: '#1D5E8C' });
  });
  it('apelido acha o time e desconhecido cai no dourado', () => {
    expect(coresDoTime('timão').brilho).toBe('#D7D7D7');
    expect(coresDoTime('Time do Bairro')).toEqual(CORES_PADRAO);
    expect(coresDoTime(null)).toEqual(CORES_PADRAO);
  });
});

describe('cores', () => {
  it('misturarHex / rgbaHex', () => {
    expect(misturarHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(misturarHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(misturarHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(rgbaHex('#ff8000', 0.5)).toBe('rgba(255,128,0,0.5)');
  });
});
