import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import {
  interpretarDiagnosticoMp,
  PREFIXO_LIBERACAO_MANUAL,
  idLiberacaoManual,
  proximoMesALiberar,
  fimDoMes,
  cadastrarAdminPlataformaSchema,
  configurarMensalidadeSchema,
  conectarMercadoPagoGeralSchema,
  configurarWebhookSecretSchema,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { exigirAdminPlataforma, exigirDev } from '../../plugins/auth.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { cifrarTokenOuErro, decifrarToken } from '../../lib/cripto.js';
import { consultarConta } from '../../lib/mercadopago-conta.js';
import { MercadoPagoErro } from '../../lib/mercadopago-preapproval.js';
import {
  consultarAssinaturaDetalhada,
  consultarContaDetalhada,
  consultarPagamentoDetalhado,
} from '../../lib/mercadopago-diagnostico.js';
import {
  expirarLiberacoesManuais,
  situacaoDasLiberacoes,
  vencimentoManual,
} from '../../lib/liberacao-manual.js';

function resumoDaLiberacao(situacao: Parameters<typeof vencimentoManual>[0]) {
  return {
    pagaPeloMercadoPago: situacao?.pagaPeloMercadoPago ?? false,
    liberadaManualmenteAte: vencimentoManual(situacao),
  };
}

export const rotasAdminPlataforma: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);
  app.addHook('preHandler', async (req) => exigirAdminPlataforma(req));

  app.get('/admin/participantes', async (req) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();
    const digitos = q.replace(/\D/g, '');

    let query = db
      .selectFrom('profiles')
      .select(['id as profileId', 'nome', 'telefone', 'foto_url as fotoUrl', 'created_at as criadoEm'])
      .orderBy('created_at', 'desc')
      .limit(100);

    if (q.length >= 2) {
      query = query.where((eb) => {
        const condicoes = [eb('nome', 'ilike', `%${q}%`)];
        if (digitos.length > 0) condicoes.push(eb('telefone', 'like', `%${digitos}%`));
        return eb.or(condicoes);
      });
    }

    return query.execute();
  });

  // Exclusão de conta por um dev (LGPD/moderação) — mesmas travas da
  // autoexclusão em /perfil: quem é dono de organização não pode ser
  // excluído sem antes transferir ou encerrar a organização.
  app.delete('/admin/participantes/:profileId', async (req, reply) => {
    exigirDev(req);
    const { profileId } = req.params as { profileId: string };

    if (profileId === req.usuario.id) {
      throw erro.invalido('Use "Excluir conta" no seu Perfil para excluir a própria conta.');
    }

    const donoDe = await db
      .selectFrom('organizacoes')
      .select('id')
      .where('dono_id', '=', profileId)
      .executeTakeFirst();
    if (donoDe) {
      throw erro.conflito(
        'Esta pessoa é dona de uma organização — transfira ou encerre a organização antes de excluir a conta.',
      );
    }

    const r = await db.deleteFrom('profiles').where('id', '=', profileId).executeTakeFirst();
    if (r.numDeletedRows === 0n) throw erro.naoEncontrado('Perfil não encontrado.');
    reply.code(204);
  });

  app.get('/admin/organizacoes', async (req) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();

    let query = db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'codigo', 'status_assinatura as statusAssinatura', 'criado_em as criadoEm'])
      .orderBy('criado_em', 'desc')
      .limit(100);

    if (q.length >= 2) {
      query = query.where('nome', 'ilike', `%${q}%`);
    }

    // Quem só estava ativo por liberação manual e passou do mês deve aparecer vencido.
    await expirarLiberacoesManuais();
    const orgs = await query.execute();
    const situacoes = await situacaoDasLiberacoes(orgs.map((o) => o.id));
    return orgs.map((o) => ({
      ...o,
      ...resumoDaLiberacao(situacoes.get(o.id)),
    }));
  });

  // Detalhe somente leitura de uma organização — qualquer admin de plataforma
  // vê, sem precisar ser membro dela.
  app.get('/admin/organizacoes/:id', async (req) => {
    const { id } = req.params as { id: string };
    // id que não é uuid estouraria no Postgres (22P02 → 500); é só "não existe".
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw erro.naoEncontrado('Organização não encontrada.');
    }

    await expirarLiberacoesManuais();
    const org = await db
      .selectFrom('organizacoes as o')
      .innerJoin('profiles as p', 'p.id', 'o.dono_id')
      .select([
        'o.id',
        'o.nome',
        'o.codigo',
        'o.status_assinatura as statusAssinatura',
        'o.criado_em as criadoEm',
        'o.mp_token_atualizado_em as mpAtualizadoEm',
        'p.id as donoId',
        'p.nome as donoNome',
        'p.telefone as donoTelefone',
      ])
      .where('o.id', '=', id)
      .executeTakeFirst();
    if (!org) throw erro.naoEncontrado('Organização não encontrada.');

    const [membros, peladas, torneios, assinaturas] = await Promise.all([
      db
        .selectFrom('organizacao_membros')
        .select([
          db.fn.countAll<string>().as('membros'),
          sql<string>`count(*) filter (where papel in ('admin', 'admin_principal'))`.as('admins'),
        ])
        .where('organizacao_id', '=', id)
        .where('ativo', '=', true)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('peladas')
        .select(db.fn.countAll<string>().as('total'))
        .where('organizacao_id', '=', id)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('torneios')
        .select(db.fn.countAll<string>().as('total'))
        .where('organizacao_id', '=', id)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('assinaturas')
        .select([
          'periodo_referencia as periodoReferencia',
          'status',
          'valor_centavos as valorCentavos',
          'atualizado_em as atualizadoEm',
        ])
        .where('organizacao_id', '=', id)
        .orderBy('periodo_referencia', 'desc')
        .orderBy('criado_em', 'desc')
        .limit(12)
        .execute(),
    ]);

    return {
      id: org.id,
      nome: org.nome,
      codigo: org.codigo,
      statusAssinatura: org.statusAssinatura,
      ...resumoDaLiberacao((await situacaoDasLiberacoes([id])).get(id)),
      criadoEm: org.criadoEm,
      dono: { profileId: org.donoId, nome: org.donoNome, telefone: org.donoTelefone },
      totais: {
        membros: Number(membros.membros),
        admins: Number(membros.admins),
        peladas: Number(peladas.total),
        torneios: Number(torneios.total),
      },
      mercadoPagoDaOrganizacaoConectado: org.mpAtualizadoEm != null,
      assinaturas,
    };
  });

  // Admin da plataforma libera um mês da mensalidade sem passar pelo Mercado
  // Pago (cortesia, pagamento por fora). Liberar de novo estende para o mês
  // seguinte; vence no último dia do mês liberado.
  app.post('/admin/organizacoes/:id/liberar-mes', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw erro.naoEncontrado('Organização não encontrada.');
    }
    const org = await db.selectFrom('organizacoes').select('id').where('id', '=', id).executeTakeFirst();
    if (!org) throw erro.naoEncontrado('Organização não encontrada.');

    const situacao = (await situacaoDasLiberacoes([id])).get(id);
    let periodo: string;
    try {
      periodo = proximoMesALiberar(situacao?.ultimoPeriodoManual ?? null, new Date());
    } catch (e) {
      throw erro.invalido(e instanceof Error ? e.message : 'Não foi possível liberar.');
    }

    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto('assinaturas')
        .values({
          organizacao_id: id,
          mp_preapproval_id: idLiberacaoManual(id),
          periodo_referencia: periodo,
          valor_centavos: 0,
          status: 'aprovado',
        })
        .onConflict((oc) =>
          oc.columns(['mp_preapproval_id', 'periodo_referencia']).doUpdateSet({
            status: 'aprovado',
            atualizado_em: new Date(),
          }),
        )
        .execute();
      await tx.updateTable('organizacoes').set({ status_assinatura: 'ativa' }).where('id', '=', id).execute();
    });

    reply.code(201);
    return { periodoReferencia: periodo, venceEm: fimDoMes(periodo) };
  });

  app.get('/admin/configuracoes', async () => {
    const cfg = await db
      .selectFrom('plataforma_config')
      .select([
        'mensalidade_valor_centavos as mensalidadeValorCentavos',
        'mp_geral_token_atualizado_em as mpGeralAtualizadoEm',
        'mp_geral_webhook_secret_atualizado_em as webhookAtualizadoEm',
      ])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    return {
      mensalidadeValorCentavos: cfg.mensalidadeValorCentavos,
      mercadoPagoConectado: cfg.mpGeralAtualizadoEm != null,
      mpGeralAtualizadoEm: cfg.mpGeralAtualizadoEm,
      webhookConfigurado: cfg.webhookAtualizadoEm != null,
      webhookAtualizadoEm: cfg.webhookAtualizadoEm,
    };
  });

  app.put('/admin/configuracoes', async (req) => {
    const { valorCentavos } = validar(configurarMensalidadeSchema, req.body);
    await db
      .updateTable('plataforma_config')
      .set({ mensalidade_valor_centavos: valorCentavos, atualizado_em: new Date() })
      .where('id', '=', 1)
      .execute();
    return { ok: true };
  });

  app.post('/admin/mercadopago', async (req) => {
    const { accessToken } = validar(conectarMercadoPagoGeralSchema, req.body);

    // Confere o token no MP antes de gravar: um token que ele não aceita só
    // apareceria como falha no checkout, bem depois.
    let conta;
    try {
      conta = await consultarConta(accessToken);
    } catch (e) {
      if (e instanceof MercadoPagoErro && (e.status === 401 || e.status === 403)) {
        throw erro.invalido(
          'O Mercado Pago não aceitou este token. Confira se você copiou o Access Token (e não a Public Key) e se ele é do ambiente certo.',
        );
      }
      req.log.error({ err: e }, 'Falha ao validar o token do Mercado Pago');
      throw erro.invalido('Não foi possível validar o token no Mercado Pago agora. Tente de novo.');
    }

    const { cipher, nonce } = cifrarTokenOuErro(accessToken);
    await db
      .updateTable('plataforma_config')
      .set({
        mp_geral_token_cipher: cipher,
        mp_geral_token_nonce: nonce,
        mp_geral_token_atualizado_em: new Date(),
        atualizado_em: new Date(),
      })
      .where('id', '=', 1)
      .execute();
    return { ok: true, conta: conta.ehTeste ? 'teste' : 'real' };
  });

  // Diagnóstico de cobrança: pergunta ao Mercado Pago pela conta vendedora, pela
  // última assinatura criada e, se informado, pela operação (o "#" da tela de recusa).
  app.get('/admin/diagnostico-mp', async (req) => {
    const operacao = ((req.query as { operacao?: string }).operacao ?? '').trim();
    if (operacao && !/^\d{5,20}$/.test(operacao)) {
      throw erro.invalido('O número da operação tem só dígitos (ex.: 184064324217).');
    }

    const cfg = await db
      .selectFrom('plataforma_config')
      .select(['mp_geral_token_cipher', 'mp_geral_token_nonce'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    if (!cfg.mp_geral_token_cipher || !cfg.mp_geral_token_nonce) {
      throw erro.invalido('Conecte a conta do Mercado Pago em Configurações antes de diagnosticar.');
    }
    const token = decifrarToken(cfg.mp_geral_token_cipher, cfg.mp_geral_token_nonce);
    const msg = (e: unknown) =>
      e instanceof MercadoPagoErro ? `${e.message} (HTTP ${e.status})` : e instanceof Error ? e.message : String(e);

    let conta;
    try {
      conta = await consultarContaDetalhada(token);
    } catch (e) {
      throw erro.invalido(`O Mercado Pago não aceitou a credencial salva: ${msg(e)}`);
    }

    const ultima = await db
      .selectFrom('assinaturas as a')
      .innerJoin('organizacoes as o', 'o.id', 'a.organizacao_id')
      .select([
        'a.mp_preapproval_id as preapprovalId',
        'a.status as statusLocal',
        'a.criado_em as criadoEm',
        'a.valor_centavos as valorCentavos',
        'o.nome as organizacao',
      ])
      .where('a.mp_preapproval_id', 'not like', `${PREFIXO_LIBERACAO_MANUAL}%`)
      .orderBy('a.criado_em', 'desc')
      .executeTakeFirst();

    let assinatura = null;
    let erroAssinatura: string | null = null;
    if (ultima) {
      try {
        assinatura = await consultarAssinaturaDetalhada(token, ultima.preapprovalId);
      } catch (e) {
        erroAssinatura = msg(e);
      }
    }

    let pagamento = null;
    let erroPagamento: string | null = null;
    if (operacao) {
      try {
        pagamento = await consultarPagamentoDetalhado(token, operacao);
      } catch (e) {
        erroPagamento = msg(e);
      }
    }

    return {
      conta,
      ultimaAssinatura: ultima ? { ...ultima, mp: assinatura, erro: erroAssinatura } : null,
      pagamento: operacao ? { operacao, mp: pagamento, erro: erroPagamento } : null,
      achados: interpretarDiagnosticoMp({ conta, assinatura, pagamento }),
    };
  });

  app.post('/admin/mercadopago/webhook-secret', async (req) => {
    const { webhookSecret } = validar(configurarWebhookSecretSchema, req.body);
    const { cipher, nonce } = cifrarTokenOuErro(webhookSecret);
    await db
      .updateTable('plataforma_config')
      .set({
        mp_geral_webhook_secret_cipher: cipher,
        mp_geral_webhook_secret_nonce: nonce,
        mp_geral_webhook_secret_atualizado_em: new Date(),
        atualizado_em: new Date(),
      })
      .where('id', '=', 1)
      .execute();
    return { ok: true };
  });

  app.get('/admin/plataforma-admins', async () => {
    return db
      .selectFrom('plataforma_admins as pa')
      .innerJoin('profiles as p', 'p.id', 'pa.profile_id')
      .select(['pa.id as id', 'p.id as profileId', 'p.nome as nome', 'p.telefone as telefone', 'pa.criado_em as criadoEm'])
      .orderBy('pa.criado_em')
      .execute();
  });

  // Busca candidatos a admin de plataforma (exclui quem já é).
  app.get('/admin/plataforma-admins/buscar', async (req) => {
    exigirDev(req);
    const q = ((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return [];
    const digitos = q.replace(/\D/g, '');

    return db
      .selectFrom('profiles as p')
      .leftJoin('plataforma_admins as pa', 'pa.profile_id', 'p.id')
      .select(['p.id as profileId', 'p.nome as nome', 'p.telefone as telefone'])
      .where('pa.id', 'is', null)
      .where((eb) => {
        const condicoes = [eb('p.nome', 'ilike', `%${q}%`)];
        if (digitos.length > 0) condicoes.push(eb('p.telefone', 'like', `%${digitos}%`));
        return eb.or(condicoes);
      })
      .orderBy('p.nome')
      .limit(6)
      .execute();
  });

  app.post('/admin/plataforma-admins', async (req, reply) => {
    exigirDev(req);
    const { profileId } = validar(cadastrarAdminPlataformaSchema, req.body);

    const existe = await db.selectFrom('profiles').select('id').where('id', '=', profileId).executeTakeFirst();
    if (!existe) throw erro.naoEncontrado('Perfil não encontrado.');

    try {
      await db
        .insertInto('plataforma_admins')
        .values({ profile_id: profileId, cadastrado_por: req.usuario.id })
        .execute();
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw erro.conflito('Essa pessoa já é admin de plataforma.');
      }
      throw e;
    }
    reply.code(201);
    return { ok: true };
  });

  app.delete('/admin/plataforma-admins/:id', async (req, reply) => {
    exigirDev(req);
    const { id } = req.params as { id: string };
    const r = await db.deleteFrom('plataforma_admins').where('id', '=', id).executeTakeFirst();
    if (r.numDeletedRows === 0n) throw erro.naoEncontrado('Admin de plataforma não encontrado.');
    reply.code(204);
  });
};
