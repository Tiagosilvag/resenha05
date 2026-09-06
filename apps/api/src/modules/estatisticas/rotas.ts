import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { periodoArtilhariaSchema } from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirDono, exigirMembro } from '../../plugins/auth.js';

/** Recorte de tempo do ranking. A semana começa na segunda. */
function intervaloDe(periodo: string, hoje = new Date()): { de: Date; ate: Date } {
  if (periodo === 'semana') {
    const diaSemana = (hoje.getDay() + 6) % 7; // segunda = 0
    const de = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diaSemana);
    return { de, ate: new Date(de.getFullYear(), de.getMonth(), de.getDate() + 7) };
  }
  if (periodo === 'trimestre') {
    const mesInicial = Math.floor(hoje.getMonth() / 3) * 3;
    return {
      de: new Date(hoje.getFullYear(), mesInicial, 1),
      ate: new Date(hoje.getFullYear(), mesInicial + 3, 1),
    };
  }
  if (periodo === 'ano') {
    return { de: new Date(hoje.getFullYear(), 0, 1), ate: new Date(hoje.getFullYear() + 1, 0, 1) };
  }
  if (periodo === 'sempre') {
    return { de: new Date(2000, 0, 1), ate: new Date(hoje.getFullYear() + 1, 0, 1) };
  }
  return {
    de: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
    ate: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1),
  };
}

export const rotasEstatisticas: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  // Ranking de gols e assistências da organização no período. Sem `periodo` na
  // query, vale o que o dono configurou para a organização.
  app.get('/organizacoes/:id/artilharia', async (req) => {
    const { id } = req.params as { id: string };
    exigirMembro(req, id);

    const org = await db
      .selectFrom('organizacoes')
      .select('periodo_artilharia')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!org) throw erro.naoEncontrado();

    const pedido = (req.query as { periodo?: string }).periodo;
    const periodo = pedido ?? org.periodo_artilharia;
    const { de, ate } = intervaloDe(periodo);

    const linhas = await db
      .selectFrom('v_eventos_jogador as e')
      .innerJoin('profiles as p', 'p.id', 'e.profile_id')
      .select([
        'p.id as profileId',
        'p.nome as nome',
        'p.foto_url as fotoUrl',
        'p.foto_recortada as fotoRecortada',
        sql<number>`count(*) filter (where e.tipo = 'gol')`.as('gols'),
        sql<number>`count(*) filter (where e.tipo = 'assistencia')`.as('assistencias'),
      ])
      .where('e.organizacao_id', '=', id)
      .where('e.quando', '>=', de)
      .where('e.quando', '<', ate)
      .groupBy(['p.id', 'p.nome', 'p.foto_url', 'p.foto_recortada'])
      .having(sql<boolean>`count(*) filter (where e.tipo in ('gol','assistencia')) > 0`)
      .orderBy('gols', 'desc')
      .orderBy('assistencias', 'desc')
      .execute();

    const ranking = linhas.map((l) => ({
      ...l,
      gols: Number(l.gols),
      assistencias: Number(l.assistencias),
    }));
    const artilheiro = ranking[0] && ranking[0].gols > 0 ? ranking[0] : null;

    return {
      periodo: { tipo: periodo, de: de.toISOString(), ate: ate.toISOString() },
      periodoDaOrganizacao: org.periodo_artilharia,
      artilheiro,
      ranking,
    };
  });

  // Só o dono decide de quanto em quanto tempo a artilharia zera.
  app.post('/organizacoes/:id/artilharia/periodo', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    const { periodo } = validar(periodoArtilhariaSchema, req.body);
    await db
      .updateTable('organizacoes')
      .set({ periodo_artilharia: periodo })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  // Números de um jogador numa organização (usado no perfil / badge).
  app.get('/organizacoes/:id/jogadores/:profileId/stats', async (req) => {
    const { id, profileId } = req.params as { id: string; profileId: string };
    exigirMembro(req, id);

    const totais = await db
      .selectFrom('v_eventos_jogador')
      .select([
        sql<number>`count(*) filter (where tipo = 'gol')`.as('gols'),
        sql<number>`count(*) filter (where tipo = 'assistencia')`.as('assistencias'),
        sql<number>`count(*) filter (where tipo = 'cartao_amarelo')`.as('amarelos'),
        sql<number>`count(*) filter (where tipo = 'cartao_vermelho')`.as('vermelhos'),
      ])
      .where('organizacao_id', '=', id)
      .where('profile_id', '=', profileId)
      .executeTakeFirst();

    if (!totais) throw erro.naoEncontrado();
    return {
      gols: Number(totais.gols),
      assistencias: Number(totais.assistencias),
      amarelos: Number(totais.amarelos),
      vermelhos: Number(totais.vermelhos),
    };
  });
};
