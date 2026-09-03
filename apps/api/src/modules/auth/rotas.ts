import type { FastifyPluginAsync } from 'fastify';
import { cadastroSchema, loginSchema, refreshSchema } from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { hashSenha, conferirSenha } from '../../lib/senha.js';
import { carregarUsuario, emitirTokens, rotacionarRefresh, revogarSessoes } from '../../lib/sessao.js';

export const rotasAuth: FastifyPluginAsync = async (app) => {
  app.post('/auth/cadastro', async (req, reply) => {
    const dados = validar(cadastroSchema, req.body);

    const jaExiste = await db
      .selectFrom('profiles')
      .select('id')
      .where('telefone', '=', dados.telefone)
      .executeTakeFirst();
    if (jaExiste) throw erro.conflito('Já existe uma conta com esse telefone.');

    const senha_hash = await hashSenha(dados.senha);
    let profileId: string;
    try {
      const novo = await db
        .insertInto('profiles')
        .values({
          nome: dados.nome,
          telefone: dados.telefone,
          senha_hash,
          time_coracao: dados.timeCoracao ?? null,
          // MVP: telefone considerado verificado no cadastro. Trocar por
          // fluxo de código via WhatsApp antes de abrir para outros organizadores.
          telefone_verificado_em: new Date(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      profileId = novo.id;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw erro.conflito('Já existe uma conta com esse telefone.');
      }
      throw e;
    }

    const tokens = await emitirTokens(app, profileId, req.headers['user-agent'] ?? null);
    reply.code(201);
    return { usuario: await carregarUsuario(profileId), ...tokens };
  });

  app.post('/auth/login', async (req) => {
    const dados = validar(loginSchema, req.body);
    const p = await db
      .selectFrom('profiles')
      .select(['id', 'senha_hash'])
      .where('telefone', '=', dados.telefone)
      .executeTakeFirst();

    const ok = p ? await conferirSenha(p.senha_hash, dados.senha) : false;
    if (!p || !ok) throw erro.naoAutorizado('Telefone ou senha incorretos.');

    const tokens = await emitirTokens(app, p.id, req.headers['user-agent'] ?? null);
    return { usuario: await carregarUsuario(p.id), ...tokens };
  });

  app.post('/auth/refresh', async (req) => {
    const { refreshToken } = validar(refreshSchema, req.body);
    const tokens = await rotacionarRefresh(app, refreshToken, req.headers['user-agent'] ?? null);
    return tokens;
  });

  app.post('/auth/logout', { preHandler: [app.autenticar] }, async (req) => {
    await revogarSessoes(req.usuario.id);
    return { ok: true };
  });

  app.get('/auth/eu', { preHandler: [app.autenticar] }, async (req) => {
    return carregarUsuario(req.usuario.id);
  });
};
