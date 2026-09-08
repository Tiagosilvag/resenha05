import type { FastifyPluginAsync } from 'fastify';
import {
  criarTorneioSchema,
  criarFaseSchema,
  criarJogoSchema,
  registrarPlacarSchema,
  eventoSumulaSchema,
  calcularClassificacao,
  type LinhaClassificacao,
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

async function orgDaFase(faseId: string): Promise<{ orgId: string; torneioId: string }> {
  const f = await db
    .selectFrom('torneio_fases as f')
    .innerJoin('torneios as t', 't.id', 'f.torneio_id')
    .select(['t.organizacao_id as orgId', 'f.torneio_id as torneioId'])
    .where('f.id', '=', faseId)
    .executeTakeFirst();
  if (!f) throw erro.naoEncontrado('Fase não encontrada.');
  return f;
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

// Times não são divididos por fase (o mesmo elenco de times do torneio joga
// em todas), então a classificação de uma fase é sempre calculada com todos
// os times do torneio — só os jogos filtram pela fase.
const FORMATOS_COM_TABELA = new Set(['grupos', 'pontos_corridos']);

export const rotasTorneios: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  app.post('/organizacoes/:id/torneios', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const d = validar(criarTorneioSchema, req.body);

    const torneio = await db.transaction().execute(async (tx) => {
      const t = await tx
        .insertInto('torneios')
        .values({ organizacao_id: id, nome: d.nome })
        .returning(['id', 'nome'])
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
      .select(['id', 'nome', 'status', 'criado_em'])
      .where('organizacao_id', '=', id)
      .orderBy('criado_em', 'desc')
      .execute();
  });

  // Cria uma fase do torneio (ex.: "Fase de grupos", "Semifinal"), cada uma
  // com seu próprio formato — é isso que permite grupos + mata-mata juntos.
  app.post('/torneios/:torneioId/fases', async (req, reply) => {
    const { torneioId } = req.params as { torneioId: string };
    exigirAdmin(req, await orgDoTorneio(torneioId));
    const d = validar(criarFaseSchema, req.body);

    const proximaOrdem = await db
      .selectFrom('torneio_fases')
      .select((eb) => eb.fn.coalesce(eb.fn.max('ordem'), eb.lit(-1)).as('max'))
      .where('torneio_id', '=', torneioId)
      .executeTakeFirst();

    const fase = await db
      .insertInto('torneio_fases')
      .values({
        torneio_id: torneioId,
        nome: d.nome,
        formato: d.formato,
        ordem: Number(proximaOrdem?.max ?? -1) + 1,
      })
      .returning(['id', 'nome', 'formato', 'ordem'])
      .executeTakeFirstOrThrow();
    reply.code(201);
    return fase;
  });

  // Remove a fase; os jogos que já tinha ficam de pé, só perdem o vínculo
  // (fase_id vira null — a FK usa on delete set null).
  app.delete('/fases/:faseId', async (req, reply) => {
    const { faseId } = req.params as { faseId: string };
    const { orgId } = await orgDaFase(faseId);
    exigirAdmin(req, orgId);
    await db.deleteFrom('torneio_fases').where('id', '=', faseId).execute();
    reply.code(204);
  });

  app.get('/torneios/:torneioId', async (req) => {
    const { torneioId } = req.params as { torneioId: string };
    const orgId = await orgDoTorneio(torneioId);
    exigirMembro(req, orgId);

    const [torneio, times, fases, jogos] = await Promise.all([
      db.selectFrom('torneios').selectAll().where('id', '=', torneioId).executeTakeFirstOrThrow(),
      db.selectFrom('torneio_times').selectAll().where('torneio_id', '=', torneioId).orderBy('nome').execute(),
      db
        .selectFrom('torneio_fases')
        .selectAll()
        .where('torneio_id', '=', torneioId)
        .orderBy('ordem')
        .execute(),
      db
        .selectFrom('jogos')
        .selectAll()
        .where('torneio_id', '=', torneioId)
        .orderBy('criado_em')
        .execute(),
    ]);

    const timesParaTabela = times.map((t) => ({ id: t.id, nome: t.nome, grupo: t.grupo }));
    const classificacoes: Record<string, LinhaClassificacao[]> = {};
    for (const f of fases) {
      if (!FORMATOS_COM_TABELA.has(f.formato)) continue;
      const jogosDaFase = jogos
        .filter((j) => j.fase_id === f.id)
        .map((j) => ({
          timeAId: j.time_a_id,
          timeBId: j.time_b_id,
          placarA: j.placar_a,
          placarB: j.placar_b,
          status: j.status,
        }));
      classificacoes[f.id] = calcularClassificacao(timesParaTabela, jogosDaFase);
    }

    return { torneio, times, fases, jogos, classificacoes };
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

    const fase = await db
      .selectFrom('torneio_fases')
      .select('id')
      .where('id', '=', d.faseId)
      .where('torneio_id', '=', torneioId)
      .executeTakeFirst();
    if (!fase) throw erro.invalido('Essa fase não é deste torneio.');

    const jogo = await db
      .insertInto('jogos')
      .values({
        torneio_id: torneioId,
        fase_id: d.faseId,
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
        .leftJoin('torneio_fases as f', 'f.id', 'j.fase_id')
        .selectAll('j')
        .select((eb) => [
          eb.fn.coalesce('ta.nome', 'j.time_a_nome').as('time_a_label'),
          eb.fn.coalesce('tb.nome', 'j.time_b_nome').as('time_b_label'),
          'f.nome as fase_nome',
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
