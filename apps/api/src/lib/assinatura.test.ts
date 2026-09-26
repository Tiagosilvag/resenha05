import { describe, it, expect } from 'vitest';
import { exigirOrganizacaoLiberada } from './assinatura.js';

describe('exigirOrganizacaoLiberada', () => {
  it('não lança para organização ativa', () => {
    expect(() => exigirOrganizacaoLiberada('ativa')).not.toThrow();
  });

  it.each(['trial', 'inadimplente', 'cancelada'] as const)('lança 403 para %s', (status) => {
    expect.assertions(2);
    try {
      exigirOrganizacaoLiberada(status);
    } catch (e) {
      expect((e as { status: number }).status).toBe(403);
      expect((e as Error).message).toBe('Esta organização está com a mensalidade pendente.');
    }
  });
});
