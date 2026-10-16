import type { FastifyPluginAsync } from 'fastify';
import {
  sortearSchema,
  sortearTimes,
  sortearTimesPorTamanho,
  amplitudeEntreTimesCheios,
  peladaExigePagamento,
  statusNoSorteio,
  moverJogadorSorteioSchema,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirMembro } from '../../plugins/auth.js';
import { renderSorteioArtePng, type TimeArte } from '../../lib/sorteio-arte.js';

function ehAdmin(papel: string): boolean {
  return papel === 'admin' || papel === 'admin_principal';
}

function dataPorExtenso(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function peladaComOrg(peladaId: string) {
  const p = await db
    .selectFrom('peladas')
    .select(['id', 'organizacao_id', 'valor'])
    .where('id', '=', peladaId)
    .executeTakeFirst();
  if (!p) throw erro.naoEncontrado('Pelada não encontrada.');
  return p;
}

/** O sorteio mais recente da pelada (o que vale), com se está confirmado. */
async function ultimoSorteio(peladaId: string) {
  const s = await db
    .selectFrom('sorteios')
    .select(['id', 'n_times', 'criado_em', 'confirmado_em'])
    .where('pelada_id', '=', peladaId)
    .orderBy('criado_em', 'desc')
    .executeTakeFirst();
  return s ? { ...s, confirmado: s.confirmado_em !== null } : null;
}

export const rotasSorteio: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  app.post('/peladas/:peladaId/sorteio', async (req, reply) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirAdmin(req, pelada.organizacao_id);
    const { nTimes, jogadoresPorTime, seed } = validar(sortearSchema, req.body);

    const vigente = await ultimoSorteio(peladaId);
    if (vigente?.confirmado) {
      throw erro.conflito('O sorteio está confirmado. Cancele a confirmação para refazer.');
    }

    const confirmados = await db
      .selectFrom('presencas as pr')
      .innerJoin('profiles as p', 'p.id', 'pr.profile_id')
      .leftJoin('organizacao_membros as m', (j) =>
        j
          .onRef('m.profile_id', '=', 'pr.profile_id')
          .on('m.organizacao_id', '=', pelada.organizacao_id),
      )
      .select([
        'pr.profile_id as profileId',
        'p.nome as nome',
        'm.estrelas as estrelas',
        'pr.status as status',
      ])
      .where('pr.pelada_id', '=', peladaId)
      .where('pr.status', 'in', ['confirmado', 'pago'])
      .execute();

    // Pelada com valor: só quem está como "pago" entra no sorteio.
    const statusQueEntram = statusNoSorteio(pelada.valor);
    const elegiveis = confirmados.filter((c) => statusQueEntram.includes(c.status as 'confirmado' | 'pago'));

    const minimo = nTimes ?? (jogadoresPorTime! + 1);
    if (elegiveis.length < minimo) {
      const para = nTimes ? `${nTimes} times` : `2 times de ${jogadoresPorTime} (precisa de mais de ${jogadoresPorTime})`;
      if (peladaExigePagamento(pelada.valor)) {
        const semPagar = confirmados.length - elegiveis.length;
        throw erro.invalido(
          `Só ${elegiveis.length} jogador(es) com pagamento confirmado para ${para}` +
            (semPagar > 0 ? ` (${semPagar} confirmado(s) ainda não pagaram).` : '.'),
        );
      }
      throw erro.invalido(`Só ${elegiveis.length} confirmado(s) para ${para}.`);
    }

    const jogadoresDoSorteio = elegiveis.map((c) => ({
      profileId: c.profileId,
      nome: c.nome,
      estrelas: c.estrelas ?? 3,
    }));
    const opcoes = seed !== undefined ? { seed } : {};
    let timesSorteados;
    try {
      timesSorteados = nTimes
        ? sortearTimes(jogadoresDoSorteio, nTimes, opcoes)
        : sortearTimesPorTamanho(jogadoresDoSorteio, jogadoresPorTime!, opcoes);
    } catch (e) {
      throw erro.invalido(e instanceof Error ? e.message : 'Não foi possível sortear.');
    }

    const resultado = await db.transaction().execute(async (tx) => {
      const s = await tx
        .insertInto('sorteios')
        .values({ pelada_id: peladaId, n_times: timesSorteados.length, criado_por: req.usuario.id })
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
      amplitudeEstrelas: amplitudeEntreTimesCheios(timesSorteados),
      times: timesSorteados,
    };
  });

  app.get('/peladas/:peladaId/sorteio', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    const vinculo = exigirMembro(req, pelada.organizacao_id);

    // Rascunho só para administradores; os participantes veem depois de confirmado.
    const sorteio = await ultimoSorteio(peladaId);
    if (!sorteio || (!ehAdmin(vinculo.papel) && !sorteio.confirmado)) return { sorteio: null, times: [] };

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
    return {
      sorteio: {
        id: sorteio.id,
        n_times: sorteio.n_times,
        criado_em: sorteio.criado_em,
        confirmado: sorteio.confirmado,
      },
      times: [...mapa.values()].sort((a, b) => a.numero - b.numero),
    };
  });

  // Publica o sorteio: a partir daqui os participantes veem os times.
  app.post('/peladas/:peladaId/sorteio/confirmar', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirAdmin(req, pelada.organizacao_id);
    const sorteio = await ultimoSorteio(peladaId);
    if (!sorteio) throw erro.naoEncontrado('Esta pelada ainda não teve sorteio.');
    if (!sorteio.confirmado) {
      await db.updateTable('sorteios').set({ confirmado_em: new Date() }).where('id', '=', sorteio.id).execute();
    }
    return { ok: true };
  });

  // Volta o sorteio a rascunho: some para os participantes e libera refazer/editar.
  app.post('/peladas/:peladaId/sorteio/cancelar-confirmacao', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirAdmin(req, pelada.organizacao_id);
    const sorteio = await ultimoSorteio(peladaId);
    if (!sorteio) throw erro.naoEncontrado('Esta pelada ainda não teve sorteio.');
    if (sorteio.confirmado) {
      const aberta = await db
        .selectFrom('jogos')
        .select('id')
        .where('pelada_id', '=', peladaId)
        .where('concluido_em', 'is', null)
        .executeTakeFirst();
      if (aberta) {
        throw erro.conflito('Há uma partida em aberto. Conclua-a antes de cancelar a confirmação do sorteio.');
      }
      await db.updateTable('sorteios').set({ confirmado_em: null }).where('id', '=', sorteio.id).execute();
    }
    return { ok: true };
  });

  // Ajuste manual: passa um jogador de um time para outro (só no rascunho).
  app.post('/peladas/:peladaId/sorteio/mover', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirAdmin(req, pelada.organizacao_id);
    const { profileId, timeNumero } = validar(moverJogadorSorteioSchema, req.body);

    const sorteio = await ultimoSorteio(peladaId);
    if (!sorteio) throw erro.naoEncontrado('Esta pelada ainda não teve sorteio.');
    if (sorteio.confirmado) {
      throw erro.conflito('O sorteio está confirmado. Cancele a confirmação para editar os times.');
    }

    const destino = await db
      .selectFrom('times')
      .select('id')
      .where('sorteio_id', '=', sorteio.id)
      .where('numero', '=', timeNumero)
      .executeTakeFirst();
    if (!destino) throw erro.naoEncontrado(`O time ${timeNumero} não existe neste sorteio.`);

    const atual = await db
      .selectFrom('time_jogadores as tj')
      .innerJoin('times as t', 't.id', 'tj.time_id')
      .select('tj.time_id as timeId')
      .where('t.sorteio_id', '=', sorteio.id)
      .where('tj.profile_id', '=', profileId)
      .executeTakeFirst();
    if (!atual) throw erro.naoEncontrado('Este jogador não está neste sorteio.');

    if (atual.timeId !== destino.id) {
      await db
        .updateTable('time_jogadores')
        .set({ time_id: destino.id })
        .where('time_id', '=', atual.timeId)
        .where('profile_id', '=', profileId)
        .execute();
    }
    return { ok: true };
  });

  // Arte compartilhável do último sorteio da pelada.
  app.get('/peladas/:peladaId/sorteio/arte.png', async (req, reply) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await db
      .selectFrom('peladas as pl')
      .innerJoin('organizacoes as o', 'o.id', 'pl.organizacao_id')
      .select(['pl.id', 'pl.organizacao_id', 'pl.data', 'o.nome as orgNome'])
      .where('pl.id', '=', peladaId)
      .executeTakeFirst();
    if (!pelada) throw erro.naoEncontrado('Pelada não encontrada.');
    const vinculo = exigirMembro(req, pelada.organizacao_id);

    const sorteio = await ultimoSorteio(peladaId);
    if (!sorteio || (!ehAdmin(vinculo.papel) && !sorteio.confirmado)) {
      throw erro.naoEncontrado('Esta pelada ainda não teve sorteio.');
    }

    const linhas = await db
      .selectFrom('times as t')
      .leftJoin('time_jogadores as tj', 'tj.time_id', 't.id')
      .leftJoin('profiles as p', 'p.id', 'tj.profile_id')
      .select(['t.numero as numero', 't.nome as nomeTime', 'p.nome as nome', 'tj.estrelas as estrelas'])
      .where('t.sorteio_id', '=', sorteio.id)
      .orderBy('t.numero')
      .orderBy('tj.estrelas', 'desc')
      .execute();

    const mapa = new Map<number, TimeArte>();
    for (const l of linhas) {
      let time = mapa.get(l.numero);
      if (!time) {
        time = { numero: l.numero, nome: l.nomeTime, totalEstrelas: 0, jogadores: [] };
        mapa.set(l.numero, time);
      }
      if (l.nome !== null || l.estrelas !== null) {
        time.jogadores.push({ nome: l.nome, estrelas: l.estrelas ?? 3 });
        time.totalEstrelas += l.estrelas ?? 0;
      }
    }
    const times = [...mapa.values()].sort((a, b) => a.numero - b.numero);
    const totais = times.map((t) => t.totalEstrelas);

    const png = await renderSorteioArtePng({
      organizacao: pelada.orgNome,
      quando: dataPorExtenso(String(pelada.data)),
      times,
      amplitude: totais.length ? Math.max(...totais) - Math.min(...totais) : 0,
    });
    reply.header('content-type', 'image/png').header('cache-control', 'public, max-age=120').send(png);
  });
};
