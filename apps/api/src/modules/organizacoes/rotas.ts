import type { FastifyPluginAsync } from 'fastify';
import {
  criarOrganizacaoSchema,
  promoverMembroSchema,
  ajustarEstrelasSchema,
  conectarMercadoPagoSchema,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirDono, exigirMembro } from '../../plugins/auth.js';
import { cifrarToken } from '../../lib/cripto.js';

function ehViolacaoDeCheck(e: unknown): boolean {
  return (e as { code?: string }).code === '23514';
}

export const rotasOrganizacoes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  // Cria uma organização e torna o criador admin_principal.
  app.post('/organizacoes', async (req, reply) => {
    const { nome } = validar(criarOrganizacaoSchema, req.body);
    const org = await db.transaction().execute(async (tx) => {
      const o = await tx
        .insertInto('organizacoes')
        .values({ nome, dono_id: req.usuario.id })
        .returning(['id', 'nome'])
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('organizacao_membros')
        .values({
          organizacao_id: o.id,
          profile_id: req.usuario.id,
          papel: 'admin_principal',
        })
        .execute();
      return o;
    });
    reply.code(201);
    return org;
  });

  // Encerra a organização (só o dono). Cascade apaga peladas, membros, torneios.
  app.delete('/organizacoes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    await db.deleteFrom('organizacoes').where('id', '=', id).execute();
    reply.code(204);
  });

  app.get('/organizacoes/:id', async (req) => {
    const { id } = req.params as { id: string };
    exigirMembro(req, id);
    const o = await db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'status_assinatura', 'mp_token_cipher', 'mp_token_atualizado_em'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!o) throw erro.naoEncontrado();
    return {
      id: o.id,
      nome: o.nome,
      statusAssinatura: o.status_assinatura,
      mercadoPagoConectado: o.mp_token_cipher != null,
      mercadoPagoAtualizadoEm: o.mp_token_atualizado_em,
    };
  });

  // Auto-inscrição de jogador (via link de convite).
  app.post('/organizacoes/:id/entrar', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existe = await db
      .selectFrom('organizacoes')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existe) throw erro.naoEncontrado('Organização não encontrada.');

    await db
      .insertInto('organizacao_membros')
      .values({ organizacao_id: id, profile_id: req.usuario.id, papel: 'jogador' })
      .onConflict((oc) => oc.columns(['organizacao_id', 'profile_id']).doNothing())
      .execute();
    reply.code(201);
    return { ok: true };
  });

  // ── Fase 3 — administração ────────────────────────────────────────────────
  app.get('/organizacoes/:id/membros', async (req) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    return db
      .selectFrom('organizacao_membros as m')
      .innerJoin('profiles as p', 'p.id', 'm.profile_id')
      .select([
        'p.id as profileId',
        'p.nome as nome',
        'p.telefone as telefone',
        'p.foto_url as fotoUrl',
        'p.foto_recortada as fotoRecortada',
        'm.papel as papel',
        'm.estrelas as estrelas',
        'm.ativo as ativo',
      ])
      .where('m.organizacao_id', '=', id)
      .orderBy('m.papel')
      .orderBy('p.nome')
      .execute();
  });

  app.post('/organizacoes/:id/membros/promover', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    const { profileId, papel } = validar(promoverMembroSchema, req.body);
    if (profileId === req.usuario.id) {
      throw erro.invalido('Você não pode alterar o próprio papel.');
    }
    try {
      const r = await db
        .updateTable('organizacao_membros')
        .set({ papel })
        .where('organizacao_id', '=', id)
        .where('profile_id', '=', profileId)
        .where('papel', '!=', 'admin_principal')
        .executeTakeFirst();
      if (r.numUpdatedRows === 0n) throw erro.naoEncontrado('Membro não encontrado.');
    } catch (e) {
      if (ehViolacaoDeCheck(e)) {
        throw erro.conflito('Esta organização já tem 5 administradores ativos.');
      }
      throw e;
    }
    return { ok: true };
  });

  app.post('/organizacoes/:id/membros/estrelas', async (req) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const { profileId, estrelas } = validar(ajustarEstrelasSchema, req.body);
    const r = await db
      .updateTable('organizacao_membros')
      .set({ estrelas })
      .where('organizacao_id', '=', id)
      .where('profile_id', '=', profileId)
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw erro.naoEncontrado('Membro não encontrado.');
    return { ok: true };
  });

  // ── Fase 6 — conectar o Mercado Pago da organização ───────────────────────
  app.post('/organizacoes/:id/mercadopago', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    const { accessToken } = validar(conectarMercadoPagoSchema, req.body);

    let cipher: Buffer;
    let nonce: Buffer;
    try {
      ({ cipher, nonce } = cifrarToken(accessToken));
    } catch {
      throw erro.invalido('Servidor sem chave de criptografia configurada (RESENHA05_ENC_KEY).');
    }
    await db
      .updateTable('organizacoes')
      .set({
        mp_token_cipher: cipher,
        mp_token_nonce: nonce,
        mp_token_atualizado_em: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });
};
