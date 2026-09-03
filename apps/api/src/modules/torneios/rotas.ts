import type { FastifyPluginAsync } from 'fastify';
import {
  criarTorneioSchema,
  criarJogoSchema,
  registrarPlacarSchema,
  eventoSumulaSchema,
  calcularClassificacao,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirMembro } from '../../plugins/auth.js';

async function orgDoTorneio(torneioId: string): Promise<string> {
  const t = await db
    .selectFrom('torneios')
    .select('organizacao_id')
    .where('id', '=', torneioId)
    .executeTakeFirst();
  if (!t) throw erro.naoEncontrado('Torneio não encontrado.');
  return t.organizacao_id;
}

async function orgDoJogo(jogoId: string): Promise<{ orgId: string; torneioId: string | null }> {
  const j = await db
    .selectFrom('jogos as j')
    .leftJoin('torneios as t', 't.id', 'j.torneio_id')
    .leftJoin('peladas as p', 'p.id', 'j.pelada_id')
    .select([
      'j.torneio_id as torneioId',
      'j.pelada_id as peladaId',
      't.organizacao_id as orgTorneio',
      'p.organizacao_id as orgPelada',
    ])
    .where('j.id', '=', jogoId)
    .executeTakeFirst();
  if (!j) throw erro.naoEncontrado('Jogo não encontrado.');
  return { orgId: (j.orgTorneio ?? j.orgPelada)!, torneioId: j.torneioId };
}

export const rotasTorneios: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  app.post('/organizacoes/:id/torneios', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const d = validar(criarTorneioSchema, req.body);

    const torneio = await db.transaction().execute(async (tx) => {
      const t = await tx
        .insertInto('torneios')
        .values({ organizacao_id: id, nome: d.nome, formato: d.formato })
        .returning(['id', 'nome', 'formato'])
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('torneio_times')
        .values(d.times.map((x) => ({ torneio_id: t.id, nome: x.nome, grupo: x.grupo ?? null })))
        .execute();
      return t;
    });
    reply.code(201);
    return torneio;
  });

  app.get('/organizacoes/:id/torneios', async (req) => {
    const { id } = req.params as { id: string };
    exigirMembro(req, id);
    return db
      .selectFrom('torneios')
      .select(['id', 'nome', 'formato', 'status', 'criado_em'])
      .where('organizacao_id', '=', id)
      .orderBy('criado_em', 'desc')
      .execute();
  });

  app.get('/torneios/:torneioId', async (req) => {
    const { torneioId } = req.params as { torneioId: string };
    const orgId = await orgDoTorneio(torneioId);
    exigirMembro(req, orgId);

    const [torneio, times, jogos] = await Promise.all([
      db.selectFrom('torneios').selectAll().where('id', '=', torneioId).executeTakeFirstOrThrow(),
      db.selectFrom('torneio_times').selectAll().where('torneio_id', '=', torneioId).orderBy('nome').execute(),
      db
        .selectFrom('jogos')
        .selectAll()
        .where('torneio_id', '=', torneioId)
        .orderBy('criado_em')
        .execute(),
    ]);

    const classificacao = calcularClassificacao(
      times.map((t) => ({ id: t.id, nome: t.nome, grupo: t.grupo })),
      jogos.map((j) => ({
        timeAId: j.time_a_id,
        timeBId: j.time_b_id,
        placarA: j.placar_a,
        placarB: j.placar_b,
        status: j.status,
      })),
    );
    return { torneio, times, jogos, classificacao };
  });

  app.post('/torneios/:torneioId/encerrar', async (req) => {
    const { torneioId } = req.params as { torneioId: string };
    exigirAdmin(req, await orgDoTorneio(torneioId));
    await db.updateTable('torneios').set({ status: 'encerrado' }).where('id', '=', torneioId).execute();
    return { ok: true };
  });

  app.post('/torneios/:torneioId/jogos', async (req, reply) => {
    const { torneioId } = req.params as { torneioId: string };
    exigirAdmin(req, await orgDoTorneio(torneioId));
    const d = validar(criarJogoSchema, req.body);
    const jogo = await db
      .insertInto('jogos')
      .values({
        torneio_id: torneioId,
        fase: d.fase ?? null,
        time_a_id: d.timeAId ?? null,
        time_b_id: d.timeBId ?? null,
        time_a_nome: d.timeANome ?? null,
        time_b_nome: d.timeBNome ?? null,
        data: d.data ? new Date(d.data) : null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    reply.code(201);
    return jogo;
  });

  app.post('/jogos/:jogoId/placar', async (req) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDoJogo(jogoId);
    exigirAdmin(req, orgId);
    const d = validar(registrarPlacarSchema, req.body);
    await db
      .updateTable('jogos')
      .set({ placar_a: d.placarA, placar_b: d.placarB, status: d.status ?? 'encerrado' })
      .where('id', '=', jogoId)
      .execute();
    return { ok: true };
  });

  app.get('/jogos/:jogoId', async (req) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDoJogo(jogoId);
    const vinculo = exigirMembro(req, orgId);
    const [jogo, eventos] = await Promise.all([
      db
        .selectFrom('jogos as j')
        .leftJoin('torneio_times as ta', 'ta.id', 'j.time_a_id')
        .leftJoin('torneio_times as tb', 'tb.id', 'j.time_b_id')
        .selectAll('j')
        .select((eb) => [
          eb.fn.coalesce('ta.nome', 'j.time_a_nome').as('time_a_label'),
          eb.fn.coalesce('tb.nome', 'j.time_b_nome').as('time_b_label'),
        ])
        .where('j.id', '=', jogoId)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('sumula_eventos as se')
        .innerJoin('profiles as p', 'p.id', 'se.profile_id')
        .select([
          'se.id as id',
          'se.tipo as tipo',
          'se.minuto as minuto',
          'se.time_id as timeId',
          'p.id as profileId',
          'p.nome as nome',
        ])
        .where('se.jogo_id', '=', jogoId)
        .orderBy('se.minuto')
        .orderBy('se.criado_em')
        .execute(),
    ]);
    return {
      jogo: { ...jogo, organizacaoId: orgId },
      eventos,
      souAdmin: vinculo.papel !== 'jogador',
    };
  });

  app.post('/jogos/:jogoId/eventos', async (req, reply) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDoJogo(jogoId);
    exigirAdmin(req, orgId);
    const d = validar(eventoSumulaSchema, req.body);
    const ev = await db
      .insertInto('sumula_eventos')
      .values({
        jogo_id: jogoId,
        profile_id: d.profileId,
        time_id: d.timeId ?? null,
        tipo: d.tipo,
        minuto: d.minuto ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    reply.code(201);
    return ev;
  });

  app.delete('/jogos/:jogoId/eventos/:eventoId', async (req, reply) => {
    const { jogoId, eventoId } = req.params as { jogoId: string; eventoId: string };
    const { orgId } = await orgDoJogo(jogoId);
    exigirAdmin(req, orgId);
    await db
      .deleteFrom('sumula_eventos')
      .where('id', '=', eventoId)
      .where('jogo_id', '=', jogoId)
      .execute();
    reply.code(204);
  });
};
