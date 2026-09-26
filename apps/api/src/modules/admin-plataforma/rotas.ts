import type { FastifyPluginAsync } from 'fastify';
import { configurarMensalidadeSchema, conectarMercadoPagoGeralSchema } from '@resenha05/shared';
import { db } from '../../db/index.js';
import { exigirAdminPlataforma } from '../../plugins/auth.js';
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
      .select(['mensalidade_valor_centavos as mensalidadeValorCentavos', 'mp_geral_token_atualizado_em as mpGeralAtualizadoEm'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    return {
      mensalidadeValorCentavos: cfg.mensalidadeValorCentavos,
      mercadoPagoConectado: cfg.mpGeralAtualizadoEm != null,
      mpGeralAtualizadoEm: cfg.mpGeralAtualizadoEm,
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
};
