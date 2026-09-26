import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { exigirAdminPlataforma, exigirDev } from './auth.js';

function reqCom(papelPlataforma: 'dev' | 'admin' | null): FastifyRequest {
  return { usuario: { papelPlataforma } } as unknown as FastifyRequest;
}

describe('exigirAdminPlataforma', () => {
  it('passa para dev e admin', () => {
    expect(() => exigirAdminPlataforma(reqCom('dev'))).not.toThrow();
    expect(() => exigirAdminPlataforma(reqCom('admin'))).not.toThrow();
  });

  it('lança 403 para jogador comum', () => {
    expect(() => exigirAdminPlataforma(reqCom(null))).toThrow('administradores da plataforma');
  });
});

describe('exigirDev', () => {
  it('passa só para dev', () => {
    expect(() => exigirDev(reqCom('dev'))).not.toThrow();
  });

  it('lança 403 para admin de plataforma comum', () => {
    expect(() => exigirDev(reqCom('admin'))).toThrow('desenvolvedor');
  });

  it('lança 403 para jogador comum', () => {
    expect(() => exigirDev(reqCom(null))).toThrow('desenvolvedor');
  });
});
