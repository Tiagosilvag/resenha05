import type { FastifyPluginAsync } from 'fastify';
import { derivarStatusOrganizacao } from '@resenha05/shared';
import { db } from '../../db/index.js';
import { env } from '../../env.js';
import { verificarAssinaturaWebhook } from '../../lib/mercadopago-webhook.js';
import { buscarPreapproval } from '../../lib/mercadopago-preapproval.js';
import { decifrarToken } from '../../lib/cripto.js';
import { processarPreapproval } from './processar.js';

export const rotasWebhookAssinatura: FastifyPluginAsync = async (app) => {
  app.post('/webhooks/mercadopago/assinatura', async (req, reply) => {
    const query = req.query as { 'data.id'?: string };
    const body = (req.body ?? {}) as { type?: string; data?: { id?: string } };
    const dataId = query['data.id'] ?? body.data?.id;

    if (!dataId || body.type !== 'subscription_preapproval') {
      // Evento que não é de preapproval (ex: teste do painel) — confirma
      // recebimento sem processar, pra o MP não ficar reenviando à toa.
      reply.code(200);
      return { ok: true };
    }

    if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
      req.log.error('MERCADOPAGO_WEBHOOK_SECRET não configurado — recusando webhook.');
      reply.code(500);
      return { erro: 'Webhook não configurado.' };
    }

    const xSignature = (req.headers['x-signature'] as string) ?? '';
    const xRequestId = (req.headers['x-request-id'] as string) ?? '';
    const valido = verificarAssinaturaWebhook({
      secret: env.MERCADOPAGO_WEBHOOK_SECRET,
      dataId,
      xRequestId,
      xSignature,
    });
    if (!valido) {
      reply.code(401);
      return { erro: 'Assinatura inválida.' };
    }

    const cfg = await db
      .selectFrom('plataforma_config')
      .select(['mp_geral_token_cipher', 'mp_geral_token_nonce'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    if (!cfg.mp_geral_token_cipher || !cfg.mp_geral_token_nonce) {
      req.log.error('Webhook recebido sem conta MP geral configurada.');
      reply.code(200); // confirma recebimento; não há o que processar
      return { ok: true };
    }
    const tokenGeral = decifrarToken(cfg.mp_geral_token_cipher, cfg.mp_geral_token_nonce);

    const resultado = await processarPreapproval(dataId, {
      carregarAssinatura: async (preapprovalId) => {
        const a = await db
          .selectFrom('assinaturas')
          .select(['organizacao_id', 'periodo_referencia'])
          .where('mp_preapproval_id', '=', preapprovalId)
          .orderBy('criado_em')
          .executeTakeFirst();
        return a ? { organizacaoId: a.organizacao_id, periodoReferencia: a.periodo_referencia } : null;
      },
      buscarPreapproval: (preapprovalId) => buscarPreapproval(tokenGeral, preapprovalId),
      aplicar: (e) =>
        db.transaction().execute(async (tx) => {
          await tx
            .insertInto('assinaturas')
            .values({
              organizacao_id: e.organizacaoId,
              mp_preapproval_id: e.preapprovalId,
              periodo_referencia: e.periodoReferencia,
              valor_centavos: e.valorCentavos,
              status: e.statusCiclo,
            })
            .onConflict((oc) =>
              oc.columns(['mp_preapproval_id', 'periodo_referencia']).doUpdateSet({
                status: e.statusCiclo,
                valor_centavos: e.valorCentavos,
                atualizado_em: new Date(),
              }),
            )
            .execute();

          // Outra assinatura aprovada da mesma organização vale mais que este evento.
          const ciclos = await tx
            .selectFrom('assinaturas')
            .select('status')
            .where('organizacao_id', '=', e.organizacaoId)
            .execute();
          await tx
            .updateTable('organizacoes')
            .set({
              status_assinatura: derivarStatusOrganizacao(
                e.statusAssinaturaEvento,
                ciclos.map((c) => c.status),
              ),
            })
            .where('id', '=', e.organizacaoId)
            .execute();
        }),
    });
    if (resultado === 'ignorado') {
      req.log.warn(`Webhook de assinatura ignorado (preapproval desconhecido ou inexistente no MP): ${dataId}`);
    }

    reply.code(200);
    return { ok: true };
  });
};
