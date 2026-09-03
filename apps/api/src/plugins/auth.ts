import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessaoUsuario, OrganizacaoDoUsuario } from '@resenha05/shared';
import { env } from '../env.js';
import { carregarUsuario } from '../lib/sessao.js';
import { erro } from '../lib/erros.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario: SessaoUsuario;
  }
  interface FastifyInstance {
    /** preHandler: exige um access token válido; popula request.usuario. */
    autenticar: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export default fp(async (app) => {
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });

  app.decorate('autenticar', async (req: FastifyRequest) => {
    let payload: { sub: string };
    try {
      payload = await req.jwtVerify<{ sub: string }>();
    } catch {
      throw erro.naoAutorizado();
    }
    req.usuario = await carregarUsuario(payload.sub);
  });
});

/** Retorna o vínculo do usuário com a organização, ou lança 403. */
export function exigirMembro(req: FastifyRequest, orgId: string): OrganizacaoDoUsuario {
  const vinculo = req.usuario.organizacoes.find((o) => o.id === orgId);
  if (!vinculo) throw erro.proibido('Você não faz parte desta organização.');
  return vinculo;
}

export function exigirAdmin(req: FastifyRequest, orgId: string): OrganizacaoDoUsuario {
  const vinculo = exigirMembro(req, orgId);
  if (vinculo.papel !== 'admin' && vinculo.papel !== 'admin_principal') {
    throw erro.proibido('Ação restrita a administradores.');
  }
  return vinculo;
}

export function exigirDono(req: FastifyRequest, orgId: string): OrganizacaoDoUsuario {
  const vinculo = exigirMembro(req, orgId);
  if (vinculo.papel !== 'admin_principal') {
    throw erro.proibido('Ação restrita ao administrador principal.');
  }
  return vinculo;
}
