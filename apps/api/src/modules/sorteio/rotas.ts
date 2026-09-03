import type { FastifyPluginAsync } from 'fastify';
import { sortearSchema, sortearTimes, amplitudeEstrelas } from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirMembro } from '../../plugins/auth.js';

async function peladaComOrg(peladaId: string) {
  const p = await db
    .selectFrom('peladas')
    .select(['id', 'organizacao_id'])
    .where('id', '=', peladaId)
    .executeTakeFirst();
  if (!p) throw erro.naoEncontrado('Pelada não encontrada.');
  return p;
}

export const rotasSorteio: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  app.post('/peladas/:peladaId/sorteio', async (req, reply) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirAdmin(req, pelada.organizacao_id);
    const { nTimes, seed } = validar(sortearSchema, req.body);

    const confirmados = await db
      .selectFrom('presencas as pr')
      .innerJoin('profiles as p', 'p.id', 'pr.profile_id')
      .leftJoin('organizacao_membros as m', (j) =>
        j
          .onRef('m.profile_id', '=', 'pr.profile_id')
          .on('m.organizacao_id', '=', pelada.organizacao_id),
      )
      .select(['pr.profile_id as profileId', 'p.nome as nome', 'm.estrelas as estrelas'])
      .where('pr.pelada_id', '=', peladaId)
      .where('pr.status', 'in', ['confirmado', 'pago'])
      .execute();

    if (confirmados.length < nTimes) {
      throw erro.invalido(`Só ${confirmados.length} confirmado(s) para ${nTimes} times.`);
    }

    const timesSorteados = sortearTimes(
      confirmados.map((c) => ({
        profileId: c.profileId,
        nome: c.nome,
        estrelas: c.estrelas ?? 3,
      })),
      nTimes,
      seed !== undefined ? { seed } : {},
    );

    const resultado = await db.transaction().execute(async (tx) => {
      const s = await tx
        .insertInto('sorteios')
        .values({ pelada_id: peladaId, n_times: nTimes, criado_por: req.usuario.id })
        .returning('id')
        .executeTakeFirstOrThrow();

      for (const t of timesSorteados) {
        const time = await tx
          .insertInto('times')
          .values({ sorteio_id: s.id, numero: t.numero })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (t.jogadores.length > 0) {
          await tx
            .insertInto('time_jogadores')
            .values(
              t.jogadores.map((j) => ({
                time_id: time.id,
                profile_id: j.profileId,
                estrelas: Math.min(5, Math.max(1, Math.round(j.estrelas))),
              })),
            )
            .execute();
        }
      }
      return s.id;
    });

    reply.code(201);
    return {
      sorteioId: resultado,
      amplitudeEstrelas: amplitudeEstrelas(timesSorteados),
      times: timesSorteados,
    };
  });

  app.get('/peladas/:peladaId/sorteio', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirMembro(req, pelada.organizacao_id);

    const sorteio = await db
      .selectFrom('sorteios')
      .select(['id', 'n_times', 'criado_em'])
      .where('pelada_id', '=', peladaId)
      .orderBy('criado_em', 'desc')
      .executeTakeFirst();
    if (!sorteio) return { sorteio: null, times: [] };

    const linhas = await db
      .selectFrom('times as t')
      .leftJoin('time_jogadores as tj', 'tj.time_id', 't.id')
      .leftJoin('profiles as p', 'p.id', 'tj.profile_id')
      .select([
        't.numero as numero',
        't.nome as nomeTime',
        'p.id as profileId',
        'p.nome as nome',
        'p.foto_url as fotoUrl',
        'tj.estrelas as estrelas',
      ])
      .where('t.sorteio_id', '=', sorteio.id)
      .orderBy('t.numero')
      .execute();

    const mapa = new Map<number, { numero: number; jogadores: unknown[]; totalEstrelas: number }>();
    for (const l of linhas) {
      let time = mapa.get(l.numero);
      if (!time) {
        time = { numero: l.numero, jogadores: [], totalEstrelas: 0 };
        mapa.set(l.numero, time);
      }
      if (l.profileId) {
        time.jogadores.push({
          profileId: l.profileId,
          nome: l.nome,
          fotoUrl: l.fotoUrl,
          estrelas: l.estrelas,
        });
        time.totalEstrelas += l.estrelas ?? 0;
      }
    }
    return { sorteio, times: [...mapa.values()].sort((a, b) => a.numero - b.numero) };
  });
};
