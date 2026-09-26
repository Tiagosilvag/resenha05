import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import { exigirAdminPlataforma } from '../../plugins/auth.js';

export const rotasAdminPlataforma: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);
  app.addHook('preHandler', async (req) => exigirAdminPlataforma(req));

  app.get('/admin/participantes', async (req) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();
    const digitos = q.replace(/\D/g, '');

    let query = db
      .selectFrom('profiles')
      .select(['id as profileId', 'nome', 'telefone', 'foto_url as fotoUrl', 'created_at as criadoEm'])
      .orderBy('created_at', 'desc')
      .limit(100);

    if (q.length >= 2) {
      query = query.where((eb) => {
        const condicoes = [eb('nome', 'ilike', `%${q}%`)];
        if (digitos.length > 0) condicoes.push(eb('telefone', 'like', `%${digitos}%`));
        return eb.or(condicoes);
      });
    }

    return query.execute();
  });

  app.get('/admin/organizacoes', async (req) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();

    let query = db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'codigo', 'status_assinatura as statusAssinatura', 'criado_em as criadoEm'])
      .orderBy('criado_em', 'desc')
      .limit(100);

    if (q.length >= 2) {
      query = query.where('nome', 'ilike', `%${q}%`);
    }

    return query.execute();
  });
};
