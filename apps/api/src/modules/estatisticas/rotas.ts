import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { erro } from '../../lib/erros.js';
import { exigirMembro } from '../../plugins/auth.js';

function intervalo(query: Record<string, unknown>): { de: Date; ate: Date } {
  const hoje = new Date();
  const periodo = String(query.periodo ?? 'mes');
  if (query.de && query.ate) {
    return { de: new Date(String(query.de)), ate: new Date(String(query.ate)) };
  }
  if (periodo === 'ano') {
    return { de: new Date(hoje.getFullYear(), 0, 1), ate: new Date(hoje.getFullYear() + 1, 0, 1) };
  }
  if (periodo === 'sempre') {
    return { de: new Date(2000, 0, 1), ate: new Date(hoje.getFullYear() + 1, 0, 1) };
  }
  return { de: new Date(hoje.getFullYear(), hoje.getMonth(), 1), ate: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1) };
}

export const rotasEstatisticas: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  // Ranking de gols e assistências da organização no período.
  app.get('/organizacoes/:id/artilharia', async (req) => {
    const { id } = req.params as { id: string };
    exigirMembro(req, id);
    const { de, ate } = intervalo(req.query as Record<string, unknown>);

    const linhas = await db
      .selectFrom('v_eventos_jogador as e')
      .innerJoin('profiles as p', 'p.id', 'e.profile_id')
      .select([
        'p.id as profileId',
        'p.nome as nome',
        'p.foto_url as fotoUrl',
        sql<number>`count(*) filter (where e.tipo = 'gol')`.as('gols'),
        sql<number>`count(*) filter (where e.tipo = 'assistencia')`.as('assistencias'),
      ])
      .where('e.organizacao_id', '=', id)
      .where('e.quando', '>=', de)
      .where('e.quando', '<', ate)
      .groupBy(['p.id', 'p.nome', 'p.foto_url'])
      .having(sql<boolean>`count(*) filter (where e.tipo in ('gol','assistencia')) > 0`)
      .orderBy('gols', 'desc')
      .orderBy('assistencias', 'desc')
      .execute();

    return {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      artilheiro: linhas[0] ?? null,
      ranking: linhas.map((l) => ({ ...l, gols: Number(l.gols), assistencias: Number(l.assistencias) })),
    };
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
