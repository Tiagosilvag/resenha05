import type { FastifyPluginAsync } from 'fastify';
import {
  cadastrarAdminPlataformaSchema,
  configurarMensalidadeSchema,
  conectarMercadoPagoGeralSchema,
  configurarWebhookSecretSchema,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { exigirAdminPlataforma, exigirDev } from '../../plugins/auth.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { cifrarToken } from '../../lib/cripto.js';

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

  // Exclusão de conta por um dev (LGPD/moderação) — mesmas travas da
  // autoexclusão em /perfil: quem é dono de organização não pode ser
  // excluído sem antes transferir ou encerrar a organização.
  app.delete('/admin/participantes/:profileId', async (req, reply) => {
    exigirDev(req);
    const { profileId } = req.params as { profileId: string };

    if (profileId === req.usuario.id) {
      throw erro.invalido('Use "Excluir conta" no seu Perfil para excluir a própria conta.');
    }

    const donoDe = await db
      .selectFrom('organizacoes')
      .select('id')
      .where('dono_id', '=', profileId)
      .executeTakeFirst();
    if (donoDe) {
      throw erro.conflito(
        'Esta pessoa é dona de uma organização — transfira ou encerre a organização antes de excluir a conta.',
      );
    }

    const r = await db.deleteFrom('profiles').where('id', '=', profileId).executeTakeFirst();
    if (r.numDeletedRows === 0n) throw erro.naoEncontrado('Perfil não encontrado.');
    reply.code(204);
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

  app.get('/admin/configuracoes', async () => {
    const cfg = await db
      .selectFrom('plataforma_config')
      .select([
        'mensalidade_valor_centavos as mensalidadeValorCentavos',
        'mp_geral_token_atualizado_em as mpGeralAtualizadoEm',
        'mp_geral_webhook_secret_atualizado_em as webhookAtualizadoEm',
      ])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    return {
      mensalidadeValorCentavos: cfg.mensalidadeValorCentavos,
      mercadoPagoConectado: cfg.mpGeralAtualizadoEm != null,
      mpGeralAtualizadoEm: cfg.mpGeralAtualizadoEm,
      webhookConfigurado: cfg.webhookAtualizadoEm != null,
      webhookAtualizadoEm: cfg.webhookAtualizadoEm,
    };
  });

  app.put('/admin/configuracoes', async (req) => {
    const { valorCentavos } = validar(configurarMensalidadeSchema, req.body);
    await db
      .updateTable('plataforma_config')
      .set({ mensalidade_valor_centavos: valorCentavos, atualizado_em: new Date() })
      .where('id', '=', 1)
      .execute();
    return { ok: true };
  });

  app.post('/admin/mercadopago', async (req) => {
    const { accessToken } = validar(conectarMercadoPagoGeralSchema, req.body);
    let cipher: Buffer;
    let nonce: Buffer;
    try {
      ({ cipher, nonce } = cifrarToken(accessToken));
    } catch {
      throw erro.invalido('Servidor sem chave de criptografia configurada (RESENHA05_ENC_KEY).');
    }
    await db
      .updateTable('plataforma_config')
      .set({
        mp_geral_token_cipher: cipher,
        mp_geral_token_nonce: nonce,
        mp_geral_token_atualizado_em: new Date(),
        atualizado_em: new Date(),
      })
      .where('id', '=', 1)
      .execute();
    return { ok: true };
  });

  app.post('/admin/mercadopago/webhook-secret', async (req) => {
    const { webhookSecret } = validar(configurarWebhookSecretSchema, req.body);
    let cipher: Buffer;
    let nonce: Buffer;
    try {
      ({ cipher, nonce } = cifrarToken(webhookSecret));
    } catch {
      throw erro.invalido('Servidor sem chave de criptografia configurada (RESENHA05_ENC_KEY).');
    }
    await db
      .updateTable('plataforma_config')
      .set({
        mp_geral_webhook_secret_cipher: cipher,
        mp_geral_webhook_secret_nonce: nonce,
        mp_geral_webhook_secret_atualizado_em: new Date(),
        atualizado_em: new Date(),
      })
      .where('id', '=', 1)
      .execute();
    return { ok: true };
  });

  app.get('/admin/plataforma-admins', async () => {
    return db
      .selectFrom('plataforma_admins as pa')
      .innerJoin('profiles as p', 'p.id', 'pa.profile_id')
      .select(['pa.id as id', 'p.id as profileId', 'p.nome as nome', 'p.telefone as telefone', 'pa.criado_em as criadoEm'])
      .orderBy('pa.criado_em')
      .execute();
  });

  // Busca candidatos a admin de plataforma (exclui quem já é).
  app.get('/admin/plataforma-admins/buscar', async (req) => {
    exigirDev(req);
    const q = ((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return [];
    const digitos = q.replace(/\D/g, '');

    return db
      .selectFrom('profiles as p')
      .leftJoin('plataforma_admins as pa', 'pa.profile_id', 'p.id')
      .select(['p.id as profileId', 'p.nome as nome', 'p.telefone as telefone'])
      .where('pa.id', 'is', null)
      .where((eb) => {
        const condicoes = [eb('p.nome', 'ilike', `%${q}%`)];
        if (digitos.length > 0) condicoes.push(eb('p.telefone', 'like', `%${digitos}%`));
        return eb.or(condicoes);
      })
      .orderBy('p.nome')
      .limit(6)
      .execute();
  });

  app.post('/admin/plataforma-admins', async (req, reply) => {
    exigirDev(req);
    const { profileId } = validar(cadastrarAdminPlataformaSchema, req.body);

    const existe = await db.selectFrom('profiles').select('id').where('id', '=', profileId).executeTakeFirst();
    if (!existe) throw erro.naoEncontrado('Perfil não encontrado.');

    try {
      await db
        .insertInto('plataforma_admins')
        .values({ profile_id: profileId, cadastrado_por: req.usuario.id })
        .execute();
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw erro.conflito('Essa pessoa já é admin de plataforma.');
      }
      throw e;
    }
    reply.code(201);
    return { ok: true };
  });

  app.delete('/admin/plataforma-admins/:id', async (req, reply) => {
    exigirDev(req);
    const { id } = req.params as { id: string };
    const r = await db.deleteFrom('plataforma_admins').where('id', '=', id).executeTakeFirst();
    if (r.numDeletedRows === 0n) throw erro.naoEncontrado('Admin de plataforma não encontrado.');
    reply.code(204);
  });
};
