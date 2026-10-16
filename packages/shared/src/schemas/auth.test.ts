import { describe, it, expect } from 'vitest';
import {
  criarJogadorEventoSchema,
  redefinirSenhaJogadorSchema,
  definirSenhaSchema,
} from './auth.js';

describe('criarJogadorEventoSchema', () => {
  it('aceita nome e telefone e normaliza o telefone para +55…', () => {
    const r = criarJogadorEventoSchema.safeParse({ nome: '  Zé da Silva ', telefone: '(61) 99280-7042' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nome).toBe('Zé da Silva');
      expect(r.data.telefone).toBe('+5561992807042');
    }
  });

  it('recusa telefone incompleto com a mensagem do cadastro normal', () => {
    const r = criarJogadorEventoSchema.safeParse({ nome: 'Zé', telefone: '6199280' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Digite o número completo com DDD: (XX) XXXXX-XXXX.');
  });

  it('recusa nome curto ou ausente', () => {
    expect(criarJogadorEventoSchema.safeParse({ nome: 'Z', telefone: '(61) 99280-7042' }).success).toBe(false);
    expect(criarJogadorEventoSchema.safeParse({ telefone: '(61) 99280-7042' }).success).toBe(false);
  });
});

describe('redefinirSenhaJogadorSchema', () => {
  it('exige um uuid', () => {
    expect(redefinirSenhaJogadorSchema.safeParse({ profileId: 'abc' }).success).toBe(false);
    expect(
      redefinirSenhaJogadorSchema.safeParse({ profileId: '3de4585f-4ba8-4e9d-9b33-e71df2d8d262' }).success,
    ).toBe(true);
  });
});

describe('definirSenhaSchema', () => {
  it('aceita senha de 8 caracteres ou mais', () => {
    expect(definirSenhaSchema.safeParse({ senhaNova: 'minhasenha1' }).success).toBe(true);
  });

  it('recusa senha curta, inclusive a provisória 123456', () => {
    const r = definirSenhaSchema.safeParse({ senhaNova: '123456' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('A senha precisa de pelo menos 8 caracteres.');
  });
});
