import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { ZodError } from 'zod';
import { env } from './env.js';
import { AppError } from './lib/erros.js';
import { pingDb } from './db/index.js';
import authPlugin from './plugins/auth.js';
import { rotasAuth } from './modules/auth/rotas.js';
import { rotasPerfil } from './modules/perfil/rotas.js';
import { rotasOrganizacoes } from './modules/organizacoes/rotas.js';
import { rotasPeladas } from './modules/peladas/rotas.js';
import { rotasSorteio } from './modules/sorteio/rotas.js';
import { rotasTorneios } from './modules/torneios/rotas.js';
import { rotasEstatisticas } from './modules/estatisticas/rotas.js';

export async function construirApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : { level: 'info' },
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : env.WEB_ORIGIN,
    credentials: true,
  });
  await app.register(authPlugin);

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ erro: err.message, codigo: err.codigo });
    }
    if (err instanceof ZodError) {
      return reply.code(422).send({ erro: err.issues[0]?.message ?? 'Dados inválidos.' });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ erro: e.message ?? 'Requisição inválida.' });
    }
    req.log.error(err as Error);
    return reply.code(500).send({ erro: 'Erro interno. Tente de novo em instantes.' });
  });

  app.register(
    async (api) => {
      api.get('/health', async () => {
        await pingDb();
        return { ok: true, ts: new Date().toISOString() };
      });
      await api.register(rotasAuth);
      await api.register(rotasPerfil);
      await api.register(rotasOrganizacoes);
      await api.register(rotasPeladas);
      await api.register(rotasSorteio);
      await api.register(rotasTorneios);
      await api.register(rotasEstatisticas);
    },
    { prefix: '/api' },
  );

  return app;
}
