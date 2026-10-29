import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  criarConfiguracaoSchema,
  criarPeladaSchema,
  criarPeladaDaConfigSchema,
  adicionarPresencaSchema,
  confirmarPresencaSchema,
  marcarPagamentoSchema,
  mudarStatusPeladaSchema,
  definirValorPeladaSchema,
  valorEmCentavos,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { env } from '../../env.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirOrganizacaoLiberada } from '../../lib/assinatura.js';
import { exigirAdmin, exigirDono, exigirMembro } from '../../plugins/auth.js';

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

      const org = await db
        .selectFrom('organizacoes')
        .select('status_assinatura')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      exigirOrganizacaoLiberada(org.status_assinatura);

      const d = validar(criarConfiguracaoSchema, req.body);
      // O valor da pelada é dinheiro do jogador pra organização — só o dono
      // (admin_principal) configura, mesmo que um admin comum possa criar a
      // configuração em si (dia/horário/local).
      if (d.valorPadrao !== undefined) exigirDono(req, id);
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
      if (d.valorPadrao !== undefined) exigirDono(req, orgId);
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

    // Apaga a configuração recorrente. As peladas já geradas ficam de pé —
    // a FK usa `on delete set null` no config_id.
    r.delete('/configuracoes/:configId', async (req, reply) => {
      const { configId } = req.params as { configId: string };
      const orgId = await orgDaConfig(configId);
      exigirAdmin(req, orgId);
      await db.deleteFrom('pelada_configuracoes').where('id', '=', configId).execute();
      reply.code(204);
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
      const vinculo = exigirMembro(req, pelada.organizacao_id);
      const souAdmin = vinculo.papel === 'admin' || vinculo.papel === 'admin_principal';

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
          'pr.pago_em as pagoEm',
          'pr.pago_metodo as pagoMetodo',
          'pr.pagamento_declarado_em as declaradoPagoEm',
        ])
        .where('pr.pelada_id', '=', peladaId)
        .orderBy('pr.confirmado_em')
        .execute();

      // Quem avisou que pagou só aparece para os administradores (e para o próprio jogador).
      const visiveis = presencas.map((x) =>
        souAdmin || x.profileId === req.usuario.id ? x : { ...x, declaradoPagoEm: null },
      );
      const meu = visiveis.find((x) => x.profileId === req.usuario.id) ?? null;

      const org = await db
        .selectFrom('organizacoes')
        .select(['pagamento_jogador_modo', 'pix_chave', 'pix_favorecido', 'pix_instrucoes', 'nome'])
        .where('id', '=', pelada.organizacao_id)
        .executeTakeFirstOrThrow();
      const pagamento = {
        modo: org.pagamento_jogador_modo,
        valorCentavos: valorEmCentavos(pelada.valor),
        organizacaoNome: org.nome,
        pix:
          org.pagamento_jogador_modo === 'pix' && org.pix_chave
            ? { chave: org.pix_chave, favorecido: org.pix_favorecido, instrucoes: org.pix_instrucoes }
            : null,
      };
      return { pelada, presencas: visiveis, minhaPresenca: meu, pagamento };
    });

    r.post('/peladas/:peladaId/presenca', async (req, reply) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirMembro(req, pelada.organizacao_id);
      if (pelada.status !== 'aberta') throw erro.conflito('A lista desta pelada está fechada.');

      const d = validar(confirmarPresencaSchema, req.body);
      const status = d.status ?? 'confirmado';

      // Quem já pagou continua pago: confirmar de novo (ou marcar "desisti") não apaga o pagamento.
      const existente = await db
        .selectFrom('presencas')
        .select('status')
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', req.usuario.id)
        .executeTakeFirst();
      if (existente?.status === 'pago') {
        reply.code(200);
        return { ok: true, status: 'pago' };
      }
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
      const existente = await db
        .selectFrom('presencas')
        .select('status')
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', req.usuario.id)
        .executeTakeFirst();
      if (existente?.status === 'pago') {
        throw erro.conflito('Você já pagou esta pelada. Fale com o organizador se não puder mais ir.');
      }
      await db
        .deleteFrom('presencas')
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', req.usuario.id)
        .execute();
      reply.code(204);
    });

    // Só o dono apaga uma pelada, e só enquanto ninguém tiver pago — depois
    // disso o caminho é cancelar (o histórico do pagamento tem que sobreviver).
    r.delete('/peladas/:peladaId', async (req, reply) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirDono(req, pelada.organizacao_id);

      const pago = await db
        .selectFrom('presencas')
        .select('profile_id')
        .where('pelada_id', '=', peladaId)
        .where('status', '=', 'pago')
        .executeTakeFirst();
      if (pago) {
        throw erro.conflito('Alguém já pagou esta pelada. Cancele a pelada em vez de excluir.');
      }

      await db.deleteFrom('peladas').where('id', '=', peladaId).execute();
      reply.code(204);
    });

    // Admin coloca alguém na lista (quem não confirmou sozinho, o cara que
    // avisou no grupo, etc). Só vale para quem é membro da organização.
    r.post('/peladas/:peladaId/presencas', async (req, reply) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirAdmin(req, pelada.organizacao_id);
      const { profileId, status } = validar(adicionarPresencaSchema, req.body);

      const membro = await db
        .selectFrom('organizacao_membros')
        .select('profile_id')
        .where('organizacao_id', '=', pelada.organizacao_id)
        .where('profile_id', '=', profileId)
        .executeTakeFirst();
      if (!membro) throw erro.invalido('Esse jogador não faz parte da organização.');

      const novoStatus = status ?? 'confirmado';
      const existente = await db
        .selectFrom('presencas')
        .select('status')
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', profileId)
        .executeTakeFirst();
      // Adicionar de novo alguém que já pagou não desfaz o pagamento.
      if (existente?.status === 'pago' && novoStatus !== 'pago') {
        reply.code(201);
        return { ok: true };
      }
      const dados =
        novoStatus === 'pago'
          ? {
              status: 'pago' as const,
              pago_em: new Date(),
              pago_por: req.usuario.id,
              pago_valor: valorEmCentavos(pelada.valor) ? (valorEmCentavos(pelada.valor)! / 100).toFixed(2) : null,
              pago_metodo: 'manual' as const,
              pagamento_declarado_em: null,
            }
          : { status: novoStatus };
      await db
        .insertInto('presencas')
        .values({ pelada_id: peladaId, profile_id: profileId, ...dados })
        .onConflict((oc) => oc.columns(['pelada_id', 'profile_id']).doUpdateSet(dados))
        .execute();
      reply.code(201);
      return { ok: true };
    });

    // Admin coloca na lista todo mundo da organização que ainda não está nela.
    // Quem já está (confirmado, pago ou que desistiu) fica como está.
    r.post('/peladas/:peladaId/presencas/todos', async (req, reply) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirAdmin(req, pelada.organizacao_id);

      const membros = await db
        .selectFrom('organizacao_membros')
        .select('profile_id')
        .where('organizacao_id', '=', pelada.organizacao_id)
        .execute();
      if (membros.length === 0) {
        reply.code(201);
        return { adicionados: 0 };
      }

      const inseridos = await db
        .insertInto('presencas')
        .values(
          membros.map((m) => ({
            pelada_id: peladaId,
            profile_id: m.profile_id,
            status: 'confirmado' as const,
          })),
        )
        .onConflict((oc) => oc.columns(['pelada_id', 'profile_id']).doNothing())
        .returning('profile_id')
        .execute();
      reply.code(201);
      return { adicionados: inseridos.length };
    });

    // Admin tira alguém da lista.
    r.delete('/peladas/:peladaId/presencas/:profileId', async (req, reply) => {
      const { peladaId, profileId } = req.params as { peladaId: string; profileId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirAdmin(req, pelada.organizacao_id);
      // Quem pagou pelo Mercado Pago não sai da lista (levaria o registro do pagamento junto).
      const pagoNoMp = await db
        .selectFrom('presencas')
        .select('profile_id')
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', profileId)
        .where('mp_payment_id', 'is not', null)
        .executeTakeFirst();
      if (pagoNoMp) {
        throw erro.conflito('Este jogador pagou pelo Mercado Pago. Para devolver, faça o estorno no Mercado Pago.');
      }
      await db
        .deleteFrom('presencas')
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', profileId)
        .execute();
      reply.code(204);
    });

    // Admin marca quem já pagou. Desmarcar volta para 'confirmado' — quem
    // pagou continua na lista de qualquer jeito.
    r.post('/peladas/:peladaId/pagamento', async (req) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirAdmin(req, pelada.organizacao_id);
      const { profileId, pago } = validar(marcarPagamentoSchema, req.body);

      const atual = await db
        .selectFrom('presencas')
        .select(['status', 'pagamento_declarado_em', 'mp_payment_id'])
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', profileId)
        .executeTakeFirst();
      if (!atual) throw erro.naoEncontrado('Esse jogador não está na lista desta pelada.');

      if (pago) {
        const centavos = valorEmCentavos(pelada.valor);
        await db
          .updateTable('presencas')
          .set({
            status: 'pago',
            pago_em: new Date(),
            pago_por: req.usuario.id,
            pago_valor: centavos ? (centavos / 100).toFixed(2) : null,
            // Quem avisou "já paguei" pagou por Pix; senão o admin recebeu por fora.
            pago_metodo: atual.pagamento_declarado_em ? 'pix' : 'manual',
            pagamento_declarado_em: null,
          })
          .where('pelada_id', '=', peladaId)
          .where('profile_id', '=', profileId)
          .execute();
        return { ok: true };
      }

      // Pagamento feito pelo Mercado Pago não se desfaz aqui: o estorno é lá.
      if (atual.mp_payment_id) {
        throw erro.conflito('Este pagamento foi feito pelo Mercado Pago. Para devolver, faça o estorno no Mercado Pago.');
      }
      await db
        .updateTable('presencas')
        .set({
          status: 'confirmado',
          pago_em: null,
          pago_por: null,
          pago_valor: null,
          pago_metodo: null,
          pagamento_declarado_em: null,
        })
        .where('pelada_id', '=', peladaId)
        .where('profile_id', '=', profileId)
        .execute();
      return { ok: true };
    });

    // Ajusta o valor de uma pelada já gerada (ex.: gerada antes da config ter
    // valor, ou um ajuste pontual pra essa semana). Dinheiro: só o dono.
    r.patch('/peladas/:peladaId/valor', async (req) => {
      const { peladaId } = req.params as { peladaId: string };
      const pelada = await orgDaPelada(req, peladaId);
      exigirDono(req, pelada.organizacao_id);
      const { valor } = validar(definirValorPeladaSchema, req.body);
      await db
        .updateTable('peladas')
        .set({ valor: valor != null ? String(valor) : null })
        .where('id', '=', peladaId)
        .execute();
      return { ok: true };
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
