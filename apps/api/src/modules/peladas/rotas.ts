import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  criarConfiguracaoSchema,
  criarPeladaSchema,
  criarPeladaDaConfigSchema,
  confirmarPresencaSchema,
  mudarStatusPeladaSchema,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { env } from '../../env.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirMembro } from '../../plugins/auth.js';

/** Descobre a organização de uma pelada e confirma que o usuário é membro. */
async function orgDaPelada(req: FastifyRequest, peladaId: string) {
  const p = await db
    .selectFrom('peladas')
    .select(['id', 'organizacao_id', 'status', 'data', 'hora', 'local', 'valor', 'tipo', 'config_id'])
    .where('id', '=', peladaId)
    .executeTakeFirst();
  if (!p) throw erro.naoEncontrado('Pelada não encontrada.');
  return p;
}

async function orgDaConfig(configId: string): Promise<string> {
  const c = await db
    .selectFrom('pelada_configuracoes')
    .select('organizacao_id')
    .where('id', '=', configId)
    .executeTakeFirst();
  if (!c) throw erro.naoEncontrado('Configuração não encontrada.');
  return c.organizacao_id;
}

function proximaData(diaSemana: number): string {
  const hoje = new Date();
  const delta = (diaSemana - hoje.getDay() + 7) % 7;
  const d = new Date(hoje);
  d.setDate(hoje.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const rotasPeladas: FastifyPluginAsync = async (app) => {
  // ── Endpoint para o n8n: cria a instância da semana a partir da config ────
  // Aceita x-service-token (n8n) OU login de admin da organização.
  app.post('/peladas/da-config', async (req, reply) => {
    const { configId, data } = validar(criarPeladaDaConfigSchema, req.body);
    const orgId = await orgDaConfig(configId);

    const token = req.headers['x-service-token'];
    const viaServico = env.SERVICE_TOKEN && token === env.SERVICE_TOKEN;
    if (!viaServico) {
      await app.autenticar(req, reply);
      exigirAdmin(req, orgId);
    }

    const cfg = await db
      .selectFrom('pelada_configuracoes')
      .selectAll()
      .where('id', '=', configId)
      .where('ativo', '=', true)
      .executeTakeFirst();
    if (!cfg) throw erro.naoEncontrado('Configuração inativa ou inexistente.');

    const dataAlvo = data ?? proximaData(cfg.dia_semana);
    const pelada = await db
      .insertInto('peladas')
      .values({
        organizacao_id: orgId,
        config_id: configId,
        data: dataAlvo,
        hora: cfg.horario_jogo,
        local: cfg.local,
        valor: cfg.valor_padrao,
      })
      .onConflict((oc) => oc.columns(['config_id', 'data']).doNothing())
      .returning(['id', 'data'])
      .executeTakeFirst();

    if (!pelada) {
      const existente = await db
        .selectFrom('peladas')
        .select(['id', 'data'])
        .where('config_id', '=', configId)
        .where('data', '=', dataAlvo)
        .executeTakeFirstOrThrow();
      return { ...existente, criada: false };
    }
    reply.code(201);
    return { ...pelada, criada: true };
  });

  // ── Daqui pra baixo exige login ──────────────────────────────────────────
  app.register(async (r) => {
    r.addHook('preHandler', r.autenticar);

    r.get('/organizacoes/:id/configuracoes', async (req) => {
      const { id } = req.params as { id: string };
      exigirMembro(req, id);
      return db
        .selectFrom('pelada_configuracoes')
        .selectAll()
        .where('organizacao_id', '=', id)
        .orderBy('ativo', 'desc')
        .orderBy('dia_semana')
        .execute();
    });

    r.post('/organizacoes/:id/configuracoes', async (req, reply) => {
      const { id } = req.params as { id: string };
      exigirAdmin(req, id);
      const d = validar(criarConfiguracaoSchema, req.body);
      const c = await db
        .insertInto('pelada_configuracoes')
        .values({
          organizacao_id: id,
          nome: d.nome,
          dia_semana: d.diaSemana,
          horario_jogo: d.horarioJogo,
          horario_lista: d.horarioLista,
          local: d.local ?? null,
          valor_padrao: d.valorPadrao != null ? String(d.valorPadrao) : null,
          ativo: d.ativo ?? true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      reply.code(201);
      return c;
    });

    r.patch('/configuracoes/:configId', async (req) => {
      const { configId } = req.params as { configId: string };
      const orgId = await orgDaConfig(configId);
      exigirAdmin(req, orgId);
      const d = validar(criarConfiguracaoSchema.partial(), req.body);
      await db
        .updateTable('pelada_configuracoes')
        .set({
          ...(d.nome !== undefined ? { nome: d.nome } : {}),
          ...(d.diaSemana !== undefined ? { dia_semana: d.diaSemana } : {}),
          ...(d.horarioJogo !== undefined ? { horario_jogo: d.horarioJogo } : {}),
          ...(d.horarioLista !== undefined ? { horario_lista: d.horarioLista } : {}),
          ...(d.local !== undefined ? { local: d.local } : {}),
          ...(d.valorPadrao !== undefined
            ? { valor_padrao: d.valorPadrao != null ? String(d.valorPadrao) : null }
            : {}),
          ...(d.ativo !== undefined ? { ativo: d.ativo } : {}),
        })
        .where('id', '=', configId)
        .execute();
      return { ok: true };
    });

    r.post('/organizacoes/:id/peladas', async (req, reply) => {
      const { id } = req.params as { id: string };
      exigirAdmin(req, id);
      const d = validar(criarPeladaSchema, req.body);
      const p = await db
        .insertInto('peladas')
        .values({
          organizacao_id: id,
          config_id: d.configId ?? null,
          tipo: d.tipo ?? 'pelada',
          data: d.data,
          hora: d.hora ?? null,
          local: d.local ?? null,
          valor: d.valor != null ? String(d.valor) : null,
        })
        .returning(['id', 'data'])
        .executeTakeFirstOrThrow();
      reply.code(201);
      return p;
    });

    r.get('/organizacoes/:id/peladas', async (req) => {
      const { id } = req.params as { id: string };
      exigirMembro(req, id);
      return db
        .selectFrom('peladas')
        .select(['id', 'data', 'hora', 'local', 'valor', 'tipo', 'status'])
        .where('organizacao_id', '=', id)
        .orderBy('data', 'desc')
        .limit(50)
        .execute();
    });

    r.get('/peladas/:peladaId', async (req) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirMembro(req, pelada.organizacao_id);

      const presencas = await db
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
          'p.foto_url as fotoUrl',
          'p.foto_recortada as fotoRecortada',
          'pr.status as status',
          'pr.confirmado_em as confirmadoEm',
          'm.estrelas as estrelas',
        ])
        .where('pr.pelada_id', '=', peladaId)
        .orderBy('pr.confirmado_em')
        .execute();

      const meu = presencas.find((x) => x.profileId === req.usuario.id) ?? null;
      return { pelada, presencas, minhaPresenca: meu };
    });

    r.post('/peladas/:peladaId/presenca', async (req, reply) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirMembro(req, pelada.organizacao_id);
      if (pelada.status !== 'aberta') throw erro.conflito('A lista desta pelada está fechada.');

      const d = validar(confirmarPresencaSchema, req.body);
      const status = d.status ?? 'confirmado';
      await db
        .insertInto('presencas')
        .values({ pelada_id: peladaId, profile_id: req.usuario.id, status })
        .onConflict((oc) =>
          oc.columns(['pelada_id', 'profile_id']).doUpdateSet({ status }),
        )
        .execute();
      reply.code(201);
      return { ok: true, status };
    });

    r.delete('/peladas/:peladaId/presenca', async (req, reply) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirMembro(req, pelada.organizacao_id);
      await db
        .deleteFrom('presencas')
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', req.usuario.id)
        .execute();
      reply.code(204);
    });

    r.post('/peladas/:peladaId/status', async (req) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirAdmin(req, pelada.organizacao_id);
      const { status } = validar(mudarStatusPeladaSchema, req.body);
      await db.updateTable('peladas').set({ status }).where('id', '=', peladaId).execute();
      return { ok: true };
    });
  });
};
