import { describe, it, expect } from 'vitest';
import {
  mascararTelefone,
  telefoneCelularValido,
  normalizarTelefone,
  formatarTelefone,
} from './telefone.js';

describe('mascararTelefone', () => {
  it('formata conforme digita', () => {
    expect(mascararTelefone('')).toBe('');
    expect(mascararTelefone('11')).toBe('(11');
    expect(mascararTelefone('1199')).toBe('(11) 99');
    expect(mascararTelefone('11991234')).toBe('(11) 99123-4');
    expect(mascararTelefone('11991234567')).toBe('(11) 99123-4567');
  });

  it('corta no 11º dígito', () => {
    expect(mascararTelefone('1199123456789999')).toBe('(11) 99123-4567');
  });

  it('ignora não-dígitos e re-formata a partir de um valor mascarado', () => {
    expect(mascararTelefone('(11) 99123-4567')).toBe('(11) 99123-4567');
    expect(mascararTelefone('(11) 9912')).toBe('(11) 9912');
  });

  it('remove o +55 colado, sem estragar o DDD 55', () => {
    expect(mascararTelefone('+55 11 99123-4567')).toBe('(11) 99123-4567');
    expect(mascararTelefone('55912345678')).toBe('(55) 91234-5678'); // DDD 55, 11 dígitos
  });
});

describe('telefoneCelularValido', () => {
  it('aceita celular completo (DDD + 9 + 8)', () => {
    expect(telefoneCelularValido('(11) 99123-4567')).toBe(true);
    expect(telefoneCelularValido('+5561900000009')).toBe(true);
  });

  it('recusa incompleto ou fixo', () => {
    expect(telefoneCelularValido('(11) 9912-3456')).toBe(false); // 10 dígitos
    expect(telefoneCelularValido('(11) 3123-4567')).toBe(false); // fixo (sem o 9)
    expect(telefoneCelularValido('11')).toBe(false);
  });

  it('bate com normalizar/formatar', () => {
    const canon = normalizarTelefone('(11) 99123-4567');
    expect(canon).toBe('+5511991234567');
    expect(formatarTelefone(canon)).toBe('(11) 99123-4567');
  });
});
