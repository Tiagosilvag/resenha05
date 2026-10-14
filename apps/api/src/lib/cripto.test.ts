import { describe, it, expect } from 'vitest';
import {
  ChaveCriptoInvalida,
  cifrarToken,
  decifrarToken,
  cifrarTokenOuErro,
  validarChave,
} from './cripto.js';

describe('validarChave', () => {
  it('diz que a chave não está configurada quando ausente ou vazia', () => {
    expect(() => validarChave(undefined)).toThrow(ChaveCriptoInvalida);
    expect(() => validarChave(undefined)).toThrow('não está configurada');
    expect(() => validarChave('')).toThrow('não está configurada');
  });

  it('diz quantos bytes a chave decodifica quando o tamanho está errado', () => {
    const de48 = Buffer.alloc(48, 1).toString('base64');
    expect(() => validarChave(de48)).toThrow(ChaveCriptoInvalida);
    expect(() => validarChave(de48)).toThrow('48 bytes');
    expect(() => validarChave(de48)).toThrow('32');
  });

  it('não vaza o valor da chave na mensagem de erro', () => {
    const de48 = Buffer.alloc(48, 1).toString('base64');
    expect(() => validarChave(de48)).not.toThrow(de48);
  });

  it('aceita uma chave de exatamente 32 bytes em base64', () => {
    const chave = validarChave(Buffer.alloc(32, 1).toString('base64'));
    expect(chave.length).toBe(32);
  });
});

describe('cifrarToken / decifrarToken', () => {
  it('decifra o que cifrou (ida e volta)', () => {
    const { cipher, nonce } = cifrarToken('APP_USR-token-de-teste');
    expect(cipher.toString('utf8')).not.toContain('token-de-teste');
    expect(decifrarToken(cipher, nonce)).toBe('APP_USR-token-de-teste');
  });
});

describe('cifrarTokenOuErro', () => {
  it('devolve cipher e nonce quando a chave está válida', () => {
    const r = cifrarTokenOuErro('segredo-qualquer');
    expect(r.cipher).toBeInstanceOf(Buffer);
    expect(r.nonce.length).toBe(12);
  });
});
