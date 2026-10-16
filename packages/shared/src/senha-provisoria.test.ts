import { describe, it, expect } from 'vitest';
import {
  SENHA_PROVISORIA,
  DIAS_SENHA_PROVISORIA,
  prazoSenhaProvisoria,
  situacaoSenhaProvisoria,
} from './senha-provisoria.js';

describe('constantes', () => {
  it('a senha provisória é 123456 e vale 3 dias', () => {
    expect(SENHA_PROVISORIA).toBe('123456');
    expect(DIAS_SENHA_PROVISORIA).toBe(3);
  });
});

describe('prazoSenhaProvisoria', () => {
  it('soma 3 dias à data de criação', () => {
    const prazo = prazoSenhaProvisoria(new Date('2026-10-20T12:00:00Z'));
    expect(prazo.toISOString()).toBe('2026-10-23T12:00:00.000Z');
  });
});

describe('situacaoSenhaProvisoria', () => {
  const agora = new Date('2026-10-21T12:00:00Z');

  it("'nenhuma' quando a conta não tem senha provisória (null ou undefined)", () => {
    expect(situacaoSenhaProvisoria(null, agora)).toBe('nenhuma');
    expect(situacaoSenhaProvisoria(undefined, agora)).toBe('nenhuma');
  });

  it("'vigente' enquanto o prazo não passou", () => {
    expect(situacaoSenhaProvisoria(new Date('2026-10-23T12:00:00Z'), agora)).toBe('vigente');
    expect(situacaoSenhaProvisoria('2026-10-23T12:00:00Z', agora)).toBe('vigente');
  });

  it("'expirada' depois do prazo", () => {
    expect(situacaoSenhaProvisoria(new Date('2026-10-20T12:00:00Z'), agora)).toBe('expirada');
  });

  it('no instante exato do prazo já está expirada', () => {
    expect(situacaoSenhaProvisoria(new Date('2026-10-21T12:00:00Z'), agora)).toBe('expirada');
  });
});
