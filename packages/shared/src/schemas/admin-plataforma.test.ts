import { describe, it, expect } from 'vitest';
import { iniciarCheckoutSchema } from './admin-plataforma.js';

describe('iniciarCheckoutSchema', () => {
  it('aceita um e-mail válido e normaliza (sem espaços, minúsculas)', () => {
    const r = iniciarCheckoutSchema.safeParse({ payerEmail: '  Comprador.Teste@TestUser.com ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.payerEmail).toBe('comprador.teste@testuser.com');
  });

  it('recusa e-mail malformado com mensagem clara', () => {
    const r = iniciarCheckoutSchema.safeParse({ payerEmail: 'nao-e-email' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Informe um e-mail válido.');
  });

  it('recusa e-mail ausente ou vazio', () => {
    expect(iniciarCheckoutSchema.safeParse({}).success).toBe(false);
    expect(iniciarCheckoutSchema.safeParse({ payerEmail: '' }).success).toBe(false);
  });
});
