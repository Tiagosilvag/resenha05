import type { FastifyPluginAsync } from 'fastify';
import { sql, type Selectable, type Transaction } from 'kysely';
import {
  atingiuLimiteDeGols,
  concluirPartidaSchema,
  criarPartidaSchema,
  decorridoSegundos,
  encerrarPartidaSchema,
  golPartidaSchema,
  instanteDoFimPorTempo,
  redistribuirPerdedor,
  regrasPartidaSchema,
  resultadoDaPartida,
  sugerirProximaPartida,
  tempoEsgotado,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import type { Database, JogosTable } from '../../db/schema.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirMembro } from '../../plugins/auth.js';

type Tx = Transaction<Database>;
type Jogo = Selectable<JogosTable>;

const ABERTAS = ['agendado', 'em_andamento', 'pausado'] as const;

function ehAdmin(papel: string): boolean {
  return papel === 'admin' || papel === 'admin_principal';
}

async function peladaComOrg(peladaId: string) {
  const p = await db
    .selectFrom('peladas')
    .select(['id', 'organizacao_id', 'data', 'local', 'partida_duracao_min', 'partida_gols_limite'])
    .where('id', '=', peladaId)
    .executeTakeFirst();
  if (!p) throw erro.naoEncontrado('Pelada não encontrada.');
  return p;
}

async function orgDaPartida(jogoId: string): Promise<{ orgId: string; peladaId: string }> {
  const j = await db
    .selectFrom('jogos as j')
    .innerJoin('peladas as p', 'p.id', 'j.pelada_id')
    .select(['p.organizacao_id as orgId', 'p.id as peladaId'])
    .where('j.id', '=', jogoId)
    .executeTakeFirst();
  if (!j) throw erro.naoEncontrado('Partida não encontrada.');
  return j;
}

/** O sorteio mais recente da pelada e se ele já foi confirmado. */
async function ultimoSorteio(peladaId: string) {
  const s = await db
    .selectFrom('sorteios')
    .select(['id', 'confirmado_em'])
    .where('pelada_id', '=', peladaId)
    .orderBy('criado_em', 'desc')
    .executeTakeFirst();
  return s ? { id: s.id, confirmado: s.confirmado_em !== null } : null;
}

interface TimeAtual {
  id: string;
  numero: number;
  nome: string | null;
  jogadores: { profileId: string; nome: string | null; estrelas: number }[];
  totalEstrelas: number;
}

/** Times de um sorteio com a composição de agora (a redistribuição altera isso). */
async function timesDoSorteio(sorteioId: string, d: typeof db | Tx = db): Promise<TimeAtual[]> {
  const linhas = await d
    .selectFrom('times as t')
    .leftJoin('time_jogadores as tj', 'tj.time_id', 't.id')
    .leftJoin('profiles as p', 'p.id', 'tj.profile_id')
    .select([
      't.id as id',
      't.numero as numero',
      't.nome as nome',
      'p.id as profileId',
      'p.nome as jogador',
      'tj.estrelas as estrelas',
    ])
    .where('t.sorteio_id', '=', sorteioId)
    .orderBy('t.numero')
    .orderBy('tj.estrelas', 'desc')
    .orderBy('p.nome')
    .execute();

  const mapa = new Map<string, TimeAtual>();
  for (const l of linhas) {
    let t = mapa.get(l.id);
    if (!t) {
      t = { id: l.id, numero: l.numero, nome: l.nome, jogadores: [], totalEstrelas: 0 };
      mapa.set(l.id, t);
    }
    if (l.profileId && l.estrelas != null) {
      t.jogadores.push({ profileId: l.profileId, nome: l.jogador, estrelas: l.estrelas });
      t.totalEstrelas += l.estrelas;
    }
  }
  return [...mapa.values()];
}

function rotuloDoTime(t: { numero: number; nome: string | null }): string {
  return t.nome ?? `Time ${t.numero}`;
}

// --- Estado da partida (sempre dentro de uma transação com a linha travada) ----

async function travarPartida(tx: Tx, jogoId: string): Promise<Jogo> {
  const j = await tx.selectFrom('jogos').selectAll().where('id', '=', jogoId).forUpdate().executeTakeFirst();
  if (!j || !j.pelada_id) throw erro.naoEncontrado('Partida não encontrada.');
  return j;
}

async function placarDosGols(tx: Tx, jogo: Jogo): Promise<{ a: number; b: number }> {
  const linhas = await tx
    .selectFrom('sumula_eventos')
    .select(['time_pelada_id', sql<string>`count(*)`.as('n')])
    .where('jogo_id', '=', jogo.id)
    .where('tipo', '=', 'gol')
    .where('removido_em', 'is', null)
    .groupBy('time_pelada_id')
    .execute();
  const de = (id: string | null) => Number(linhas.find((l) => l.time_pelada_id === id)?.n ?? 0);
  return { a: de(jogo.time_a_sorteio_id), b: de(jogo.time_b_sorteio_id) };
}

function vencedorPeloPlacar(jogo: Jogo, a: number, b: number): string | null {
  const r = resultadoDaPartida(a, b);
  if (r === 'a') return jogo.time_a_sorteio_id;
  if (r === 'b') return jogo.time_b_sorteio_id;
  return null;
}

/** Fecha a partida no instante `quando`, congelando o cronômetro. */
async function finalizar(
  tx: Tx,
  jogo: Jogo,
  motivo: 'tempo' | 'gols' | 'manual',
  quando: Date,
  observacao?: string,
): Promise<Jogo> {
  const placar = await placarDosGols(tx, jogo);
  const acumulado = decorridoSegundos(
    { acumuladoSeg: jogo.acumulado_seg, retomadoEm: jogo.retomado_em },
    quando,
  );
  const atualizado = await tx
    .updateTable('jogos')
    .set({
      status: 'encerrado',
      retomado_em: null,
      acumulado_seg: acumulado,
      encerrado_em: quando,
      encerramento: motivo,
      observacao: observacao ?? jogo.observacao,
      placar_a: placar.a,
      placar_b: placar.b,
      vencedor_time_id: vencedorPeloPlacar(jogo, placar.a, placar.b),
    })
    .where('id', '=', jogo.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return atualizado;
}

/** Se o tempo acabou enquanto a partida rodava, encerra no instante exato do fim. */
async function encerrarSeTempoAcabou(tx: Tx, jogo: Jogo, agora = new Date()): Promise<Jogo> {
  if (jogo.status !== 'em_andamento' || !jogo.retomado_em || jogo.duracao_min == null) return jogo;
  const relogio = { acumuladoSeg: jogo.acumulado_seg, retomadoEm: jogo.retomado_em };
  if (!tempoEsgotado(decorridoSegundos(relogio, agora), jogo.duracao_min)) return jogo;
  const fim = instanteDoFimPorTempo({ ...relogio, retomadoEm: jogo.retomado_em }, jogo.duracao_min);
  return finalizar(tx, jogo, 'tempo', fim);
}

/** Roda `fn` com a partida travada e já com o fim por tempo aplicado. */
async function comPartida<T>(jogoId: string, fn: (tx: Tx, jogo: Jogo) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (tx) => {
    const jogo = await encerrarSeTempoAcabou(tx, await travarPartida(tx, jogoId));
    return fn(tx, jogo);
  });
}

// --- Montagem da resposta -------------------------------------------------------

async function montarPartidas(peladaId: string, agora: Date) {
  const jogos = await db
    .selectFrom('jogos')
    .selectAll()
    .where('pelada_id', '=', peladaId)
    .orderBy('criado_em')
    .execute();
  if (jogos.length === 0) return [];
  const ids = jogos.map((j) => j.id);

  const [jogadores, gols, times] = await Promise.all([
    db
      .selectFrom('partida_jogadores as pj')
      .innerJoin('profiles as p', 'p.id', 'pj.profile_id')
      .select(['pj.jogo_id as jogoId', 'pj.time_id as timeId', 'p.id as profileId', 'p.nome as nome', 'pj.estrelas as estrelas'])
      .where('pj.jogo_id', 'in', ids)
      .orderBy('pj.estrelas', 'desc')
      .orderBy('p.nome')
      .execute(),
    db
      .selectFrom('sumula_eventos as se')
      .innerJoin('profiles as p', 'p.id', 'se.profile_id')
      .select([
        'se.id as id',
        'se.jogo_id as jogoId',
        'se.time_pelada_id as timeId',
        'se.criado_em as criadoEm',
        'p.id as profileId',
        'p.nome as nome',
      ])
      .where('se.jogo_id', 'in', ids)
      .where('se.tipo', '=', 'gol')
      .where('se.removido_em', 'is', null)
      .orderBy('se.criado_em')
      .execute(),
    db
      .selectFrom('times')
      .select(['id', 'numero', 'nome'])
      .where(
        'id',
        'in',
        [...new Set(jogos.flatMap((j) => [j.time_a_sorteio_id, j.time_b_sorteio_id, j.vencedor_time_id, j.perdedor_time_id]))].filter(
          (x): x is string => Boolean(x),
        ),
      )
      .execute(),
  ]);
  const rotulos = new Map(times.map((t) => [t.id, rotuloDoTime(t)]));

  return jogos.map((j) => {
    const decorrido = decorridoSegundos({ acumuladoSeg: j.acumulado_seg, retomadoEm: j.retomado_em }, agora);
    const meusGols = gols.filter((g) => g.jogoId === j.id);
    const placarA = meusGols.filter((g) => g.timeId === j.time_a_sorteio_id).length;
    const placarB = meusGols.filter((g) => g.timeId === j.time_b_sorteio_id).length;
    return {
      id: j.id,
      status: j.status,
      timeA: { id: j.time_a_sorteio_id, nome: rotulos.get(j.time_a_sorteio_id ?? '') ?? j.time_a_nome ?? 'Time A' },
      timeB: { id: j.time_b_sorteio_id, nome: rotulos.get(j.time_b_sorteio_id ?? '') ?? j.time_b_nome ?? 'Time B' },
      placarA,
      placarB,
      duracaoMin: j.duracao_min,
      golsLimite: j.gols_limite,
      decorridoSeg: decorrido,
      restanteSeg: j.duracao_min != null ? Math.max(0, j.duracao_min * 60 - decorrido) : null,
      rodando: j.status === 'em_andamento' && j.retomado_em != null,
      iniciadoEm: j.iniciado_em,
      encerradoEm: j.encerrado_em,
      encerramento: j.encerramento,
      observacao: j.observacao,
      vencedorTimeId: j.vencedor_time_id,
      perdedorTimeId: j.perdedor_time_id,
      concluida: j.concluido_em != null,
      redistribuicao: j.redistribuicao,
      jogadores: jogadores
        .filter((x) => x.jogoId === j.id)
        .map(({ jogoId: _j, ...x }) => x),
      gols: meusGols.map((g) => ({
        id: g.id,
        timeId: g.timeId,
        profileId: g.profileId,
        nome: g.nome,
        criadoEm: g.criadoEm,
      })),
    };
  });
}

async function artilhariaDaPelada(peladaId: string) {
  const linhas = await db
    .selectFrom('v_eventos_jogador as e')
    .innerJoin('profiles as p', 'p.id', 'e.profile_id')
    .select([
      'p.id as profileId',
      'p.nome as nome',
      'p.foto_url as fotoUrl',
      'p.foto_recortada as fotoRecortada',
      sql<string>`count(*)`.as('gols'),
    ])
    .where('e.pelada_id', '=', peladaId)
    .where('e.tipo', '=', 'gol')
    .groupBy(['p.id', 'p.nome', 'p.foto_url', 'p.foto_recortada'])
    .orderBy('gols', 'desc')
    .orderBy('p.nome')
    .execute();
  return linhas.map((l) => ({ ...l, gols: Number(l.gols) }));
}

/** Partida ainda não concluída (aguardando, rodando, pausada ou à espera do perdedor). */
async function partidaAberta(peladaId: string, d: typeof db | Tx = db) {
  return d
    .selectFrom('jogos')
    .select(['id', 'status'])
    .where('pelada_id', '=', peladaId)
    .where('concluido_em', 'is', null)
    .executeTakeFirst();
}

export const rotasPartidas: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  // Tudo da tela de partidas num só GET: regras, times de agora, partidas, artilharia.
  app.get('/peladas/:peladaId/partidas', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    const vinculo = exigirMembro(req, pelada.organizacao_id);
    const souAdmin = ehAdmin(vinculo.papel);

    // Fecha, uma a uma, as partidas cujo tempo acabou enquanto ninguém olhava.
    const rodando = await db
      .selectFrom('jogos')
      .select('id')
      .where('pelada_id', '=', peladaId)
      .where('status', '=', 'em_andamento')
      .execute();
    for (const r of rodando) await comPartida(r.id, async () => undefined);

    const agora = new Date();
    const sorteio = await ultimoSorteio(peladaId);
    const visivel = sorteio && (sorteio.confirmado || souAdmin);
    const times = visivel ? await timesDoSorteio(sorteio.id) : [];
    const partidas = await montarPartidas(peladaId, agora);

    const concluidas = partidas.filter((p) => p.concluida && p.timeA.id && p.timeB.id);
    const porTime = Math.max(0, ...times.map((t) => t.jogadores.length));
    const sugestao = sugerirProximaPartida(
      times.map((t) => ({ id: t.id, numero: t.numero, jogadores: t.jogadores.length })),
      concluidas.map((p) => ({
        timeAId: p.timeA.id!,
        timeBId: p.timeB.id!,
        vencedorId: p.perdedorTimeId ? (p.perdedorTimeId === p.timeA.id ? p.timeB.id : p.timeA.id) : null,
      })),
    );

    return {
      souAdmin,
      agora: agora.toISOString(),
      pelada: { data: pelada.data, local: pelada.local },
      regras: { duracaoMin: pelada.partida_duracao_min, golsLimite: pelada.partida_gols_limite },
      sorteio: sorteio ? { confirmado: sorteio.confirmado } : null,
      times: times.map((t) => ({ ...t, nome: rotuloDoTime(t) })),
      porTime,
      partidas,
      sugestao,
      artilharia: await artilhariaDaPelada(peladaId),
    };
  });

  // Duração e limite de gols valem para todas as partidas da pelada.
  app.put('/peladas/:peladaId/partidas/regras', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirAdmin(req, pelada.organizacao_id);
    const d = validar(regrasPartidaSchema, req.body);
    if (await partidaAberta(peladaId)) {
      throw erro.conflito('Conclua a partida atual antes de mudar as regras.');
    }
    await db
      .updateTable('peladas')
      .set({ partida_duracao_min: d.duracaoMin, partida_gols_limite: d.golsLimite })
      .where('id', '=', peladaId)
      .execute();
    return { ok: true };
  });

  app.post('/peladas/:peladaId/partidas', async (req, reply) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirAdmin(req, pelada.organizacao_id);
    const d = validar(criarPartidaSchema, req.body);

    const sorteio = await ultimoSorteio(peladaId);
    if (!sorteio?.confirmado) throw erro.conflito('Confirme o sorteio antes de começar as partidas.');

    const times = await timesDoSorteio(sorteio.id);
    const a = times.find((t) => t.id === d.timeAId);
    const b = times.find((t) => t.id === d.timeBId);
    if (!a || !b) throw erro.invalido('Os times escolhidos não são do sorteio atual.');
    if (a.jogadores.length === 0 || b.jogadores.length === 0) {
      throw erro.invalido('Os dois times precisam ter jogadores.');
    }

    try {
      const id = await db.transaction().execute(async (tx) => {
        if (await partidaAberta(peladaId, tx)) {
          throw erro.conflito('Já existe uma partida em aberto. Conclua-a antes de criar outra.');
        }
        const j = await tx
          .insertInto('jogos')
          .values({
            pelada_id: peladaId,
            time_a_sorteio_id: a.id,
            time_b_sorteio_id: b.id,
            time_a_nome: rotuloDoTime(a),
            time_b_nome: rotuloDoTime(b),
            placar_a: 0,
            placar_b: 0,
            duracao_min: pelada.partida_duracao_min,
            gols_limite: pelada.partida_gols_limite,
            criado_por: req.usuario.id,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await tx
          .insertInto('partida_jogadores')
          .values(
            [a, b].flatMap((t) =>
              t.jogadores.map((jg) => ({
                jogo_id: j.id,
                profile_id: jg.profileId,
                time_id: t.id,
                estrelas: jg.estrelas,
              })),
            ),
          )
          .execute();
        return j.id;
      });
      reply.code(201);
      return { id };
    } catch (e) {
      // Dois cliques ao mesmo tempo: o índice único segura o segundo.
      if ((e as { code?: string }).code === '23505') {
        throw erro.conflito('Já existe uma partida em aberto. Conclua-a antes de criar outra.');
      }
      throw e;
    }
  });

  // Cancela uma partida que ainda nem começou.
  app.delete('/partidas/:jogoId', async (req, reply) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);
    await comPartida(jogoId, async (tx, jogo) => {
      if (jogo.status !== 'agendado') throw erro.conflito('Só dá para cancelar uma partida que não começou.');
      await tx.deleteFrom('jogos').where('id', '=', jogo.id).execute();
    });
    reply.code(204);
  });

  app.post('/partidas/:jogoId/iniciar', async (req) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);
    await comPartida(jogoId, async (tx, jogo) => {
      if (jogo.status === 'em_andamento') return; // clique repetido
      if (jogo.status !== 'agendado') throw erro.conflito('Esta partida já foi iniciada.');
      const agora = new Date();
      await tx
        .updateTable('jogos')
        .set({ status: 'em_andamento', iniciado_em: agora, retomado_em: agora, data: agora, acumulado_seg: 0 })
        .where('id', '=', jogo.id)
        .execute();
    });
    return { ok: true };
  });

  app.post('/partidas/:jogoId/pausar', async (req) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);
    await comPartida(jogoId, async (tx, jogo) => {
      if (jogo.status === 'pausado') return;
      if (jogo.status !== 'em_andamento') throw erro.conflito('A partida não está em andamento.');
      const acumulado = decorridoSegundos({ acumuladoSeg: jogo.acumulado_seg, retomadoEm: jogo.retomado_em }, new Date());
      await tx
        .updateTable('jogos')
        .set({ status: 'pausado', retomado_em: null, acumulado_seg: acumulado })
        .where('id', '=', jogo.id)
        .execute();
    });
    return { ok: true };
  });

  app.post('/partidas/:jogoId/retomar', async (req) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);
    await comPartida(jogoId, async (tx, jogo) => {
      if (jogo.status === 'em_andamento') return;
      if (jogo.status !== 'pausado') throw erro.conflito('A partida não está pausada.');
      await tx
        .updateTable('jogos')
        .set({ status: 'em_andamento', retomado_em: new Date() })
        .where('id', '=', jogo.id)
        .execute();
    });
    return { ok: true };
  });

  app.post('/partidas/:jogoId/encerrar', async (req) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);
    const { observacao } = validar(encerrarPartidaSchema, req.body ?? {});
    await comPartida(jogoId, async (tx, jogo) => {
      if (jogo.status === 'encerrado') return; // já encerrou (inclusive pelo tempo ou por gols)
      if (jogo.status === 'agendado') throw erro.conflito('Inicie a partida antes de encerrar.');
      await finalizar(tx, jogo, 'manual', new Date(), observacao);
    });
    return { ok: true };
  });

  app.post('/partidas/:jogoId/gols', async (req, reply) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);
    const d = validar(golPartidaSchema, req.body);

    await comPartida(jogoId, async (tx, jogo) => {
      if (jogo.status === 'encerrado') throw erro.conflito('A partida já terminou.');
      if (jogo.status === 'agendado') throw erro.conflito('Inicie a partida para registrar gols.');
      if (d.timeId !== jogo.time_a_sorteio_id && d.timeId !== jogo.time_b_sorteio_id) {
        throw erro.invalido('Esse time não está na partida.');
      }
      const joga = await tx
        .selectFrom('partida_jogadores')
        .select('profile_id')
        .where('jogo_id', '=', jogo.id)
        .where('time_id', '=', d.timeId)
        .where('profile_id', '=', d.profileId)
        .executeTakeFirst();
      if (!joga) throw erro.invalido('Esse jogador não é do time que marcou.');

      await tx
        .insertInto('sumula_eventos')
        .values({
          jogo_id: jogo.id,
          profile_id: d.profileId,
          time_pelada_id: d.timeId,
          tipo: 'gol',
          criado_por: req.usuario.id,
        })
        .execute();

      const placar = await placarDosGols(tx, jogo);
      const atual = await tx
        .updateTable('jogos')
        .set({ placar_a: placar.a, placar_b: placar.b })
        .where('id', '=', jogo.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      // A transação trava a linha: o limite só encerra uma vez, mesmo com gols simultâneos.
      if (atingiuLimiteDeGols(placar.a, placar.b, jogo.gols_limite)) {
        await finalizar(tx, atual, 'gols', new Date());
      }
    });
    reply.code(201);
    return { ok: true };
  });

  // Correção: remove o gol (fica registrado quem removeu e quando) e recalcula tudo.
  app.delete('/partidas/:jogoId/gols/:eventoId', async (req, reply) => {
    const { jogoId, eventoId } = req.params as { jogoId: string; eventoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);

    await comPartida(jogoId, async (tx, jogo) => {
      if (jogo.concluido_em) throw erro.conflito('A partida já foi concluída; não dá mais para corrigir gols.');
      const removido = await tx
        .updateTable('sumula_eventos')
        .set({ removido_em: new Date(), removido_por: req.usuario.id })
        .where('id', '=', eventoId)
        .where('jogo_id', '=', jogo.id)
        .where('removido_em', 'is', null)
        .executeTakeFirst();
      if (removido.numUpdatedRows === 0n) return; // já removido (clique repetido)

      const placar = await placarDosGols(tx, jogo);
      await tx.updateTable('jogos').set({ placar_a: placar.a, placar_b: placar.b }).where('id', '=', jogo.id).execute();

      if (jogo.status !== 'encerrado') return;
      const aindaAtingiu = atingiuLimiteDeGols(placar.a, placar.b, jogo.gols_limite);
      if (jogo.encerramento === 'gols' && !aindaAtingiu) {
        // O gol que fechou a partida foi desfeito: ela volta, pausada, de onde parou.
        await tx
          .updateTable('jogos')
          .set({ status: 'pausado', encerrado_em: null, encerramento: null, vencedor_time_id: null })
          .where('id', '=', jogo.id)
          .execute();
      } else {
        await tx
          .updateTable('jogos')
          .set({ vencedor_time_id: vencedorPeloPlacar(jogo, placar.a, placar.b) })
          .where('id', '=', jogo.id)
          .execute();
      }
    });
    reply.code(204);
  });

  // Fecha o ciclo da partida: o responsável diz quem perdeu e, se for o caso, o
  // time perdedor se desfaz para completar o time que sobrou.
  app.post('/partidas/:jogoId/concluir', async (req) => {
    const { jogoId } = req.params as { jogoId: string };
    const { orgId } = await orgDaPartida(jogoId);
    exigirAdmin(req, orgId);
    const { perdedorTimeId } = validar(concluirPartidaSchema, req.body);

    return comPartida(jogoId, async (tx, jogo) => {
      if (jogo.concluido_em) return { redistribuicao: jogo.redistribuicao ?? null }; // clique repetido
      if (jogo.status !== 'encerrado') throw erro.conflito('Encerre a partida antes de concluir.');
      if (perdedorTimeId && perdedorTimeId !== jogo.time_a_sorteio_id && perdedorTimeId !== jogo.time_b_sorteio_id) {
        throw erro.invalido('O time que perdeu precisa ser um dos dois da partida.');
      }

      let resumo: Record<string, unknown> | null = null;
      if (perdedorTimeId) {
        const mantido = perdedorTimeId === jogo.time_a_sorteio_id ? jogo.time_b_sorteio_id : jogo.time_a_sorteio_id;
        const sorteio = await tx
          .selectFrom('times')
          .select('sorteio_id')
          .where('id', '=', perdedorTimeId)
          .executeTakeFirstOrThrow();
        const times = await timesDoSorteio(sorteio.sorteio_id, tx);
        const porTime = Math.max(...times.map((t) => t.jogadores.length));
        const perdedor = times.find((t) => t.id === perdedorTimeId)!;
        const vencedor = times.find((t) => t.id === mantido)!;
        // O time que sobrou: o incompleto, fora da partida, mais perto de ficar completo.
        const sobra = times
          .filter((t) => t.id !== perdedor.id && t.id !== vencedor.id && t.jogadores.length < porTime)
          .sort((x, y) => y.jogadores.length - x.jogadores.length || x.numero - y.numero)[0];

        if (sobra && perdedor.jogadores.length >= porTime - sobra.jogadores.length) {
          const r = redistribuirPerdedor({
            vencedor: { id: vencedor.id, jogadores: vencedor.jogadores },
            perdedor: { id: perdedor.id, jogadores: perdedor.jogadores },
            sobra: { id: sobra.id, jogadores: sobra.jogadores },
            porTime,
          });
          const movidos = perdedor.jogadores.filter((j) => r.novosNaSobra.includes(j.profileId));
          await tx
            .deleteFrom('time_jogadores')
            .where('time_id', '=', perdedor.id)
            .where('profile_id', 'in', movidos.map((m) => m.profileId))
            .execute();
          await tx
            .insertInto('time_jogadores')
            .values(movidos.map((m) => ({ time_id: sobra.id, profile_id: m.profileId, estrelas: m.estrelas })))
            .execute();
          resumo = {
            perdedorTimeId: perdedor.id,
            sobraTimeId: sobra.id,
            referenciaTimeId: vencedor.id,
            movidos: movidos.map((m) => ({ profileId: m.profileId, nome: m.nome, estrelas: m.estrelas })),
            totalNovoTime: r.totalNovoTime,
            totalReferencia: vencedor.totalEstrelas,
            diferenca: r.diferenca,
          };
        }
      }

      await tx
        .updateTable('jogos')
        .set({
          perdedor_time_id: perdedorTimeId,
          concluido_em: new Date(),
          concluido_por: req.usuario.id,
          redistribuicao: resumo ? JSON.stringify(resumo) : null,
        })
        .where('id', '=', jogo.id)
        .execute();
      return { redistribuicao: resumo };
    });
  });

  app.get('/peladas/:peladaId/artilharia', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const pelada = await peladaComOrg(peladaId);
    exigirMembro(req, pelada.organizacao_id);
    return { ranking: await artilhariaDaPelada(peladaId) };
  });
};
