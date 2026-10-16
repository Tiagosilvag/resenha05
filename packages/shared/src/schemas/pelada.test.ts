import { describe, it, expect } from 'vitest';
import { moverJogadorSorteioSchema } from './pelada.js';

describe('moverJogadorSorteioSchema', () => {
  const uuid = '3de4585f-4ba8-4e9d-9b33-e71df2d8d262';

  it('aceita o jogador e o número do time de destino', () => {
    const r = moverJogadorSorteioSchema.safeParse({ profileId: uuid, timeNumero: 2 });
    expect(r.success).toBe(true);
  });

  it('recusa jogador que não é uuid', () => {
    expect(moverJogadorSorteioSchema.safeParse({ profileId: 'abc', timeNumero: 2 }).success).toBe(false);
  });

  it('recusa número de time fora de 1..32 ou não inteiro', () => {
    expect(moverJogadorSorteioSchema.safeParse({ profileId: uuid, timeNumero: 0 }).success).toBe(false);
    expect(moverJogadorSorteioSchema.safeParse({ profileId: uuid, timeNumero: 33 }).success).toBe(false);
    expect(moverJogadorSorteioSchema.safeParse({ profileId: uuid, timeNumero: 1.5 }).success).toBe(false);
  });

  it('exige os dois campos', () => {
    expect(moverJogadorSorteioSchema.safeParse({ profileId: uuid }).success).toBe(false);
    expect(moverJogadorSorteioSchema.safeParse({ timeNumero: 1 }).success).toBe(false);
  });
});
