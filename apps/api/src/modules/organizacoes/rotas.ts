import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  confirmarPagamentoAvulsoSchema,
  idPagamentoAvulso,
  proximoMesALiberar,
  referenciaDoPagamentoAvulso,
  criarOrganizacaoSchema,
  entrarPorCodigoSchema,
  promoverMembroSchema,
  ajustarEstrelasSchema,
  adicionarMembroSchema,
  removerMembroSchema,
  conectarMercadoPagoSchema,
  podeIniciarCheckout,
  iniciarCheckoutSchema,
  criarJogadorEventoSchema,
  redefinirSenhaJogadorSchema,
  SENHA_PROVISORIA,
  prazoSenhaProvisoria,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirDono, exigirMembro } from '../../plugins/auth.js';
import { cifrarTokenOuErro, decifrarToken } from '../../lib/cripto.js';
import { criarPreapproval } from '../../lib/mercadopago-preapproval.js';
import { criarPreferencia } from '../../lib/mercadopago-preferencia.js';
import { conferirPagamentoAvulso, tokenDaPlataforma } from '../../lib/pagamento-avulso.js';
import { expirarLiberacoesManuais, situacaoDasLiberacoes, vencimentoManual } from '../../lib/liberacao-manual.js';
import { exigirOrganizacaoLiberada, traduzirErroCobranca } from '../../lib/assinatura.js';
import { primeiroDiaDoMesUtc } from '../../lib/periodo.js';
import { hashSenha } from '../../lib/senha.js';
import { revogarSessoes } from '../../lib/sessao.js';
import { env } from '../../env.js';

function ehViolacaoDeCheck(e: unknown): boolean {
  return (e as { code?: string }).code === '23514';
}

export const rotasOrganizacoes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  // Cria uma organização e torna o criador admin_principal.
  app.post('/organizacoes', async (req, reply) => {
    const { nome } = validar(criarOrganizacaoSchema, req.body);
    const cfg = await db
      .selectFrom('plataforma_config')
      .select('criacao_organizacoes_bloqueada')
      .where('id', '=', 1)
      .executeTakeFirst();
    if (cfg?.criacao_organizacoes_bloqueada && req.usuario.papelPlataforma == null) {
      throw erro.proibido('A criação de organizações está temporariamente bloqueada.');
    }
    const org = await db.transaction().execute(async (tx) => {
      const o = await tx
        .insertInto('organizacoes')
        .values({ nome, dono_id: req.usuario.id })
        .returning(['id', 'nome', 'codigo'])
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('organizacao_membros')
        .values({
          organizacao_id: o.id,
          profile_id: req.usuario.id,
          papel: 'admin_principal',
        })
        .execute();
      return o;
    });
    reply.code(201);
    return org;
  });

  // Encerra a organização (só o dono). Cascade apaga peladas, membros, torneios.
  app.delete('/organizacoes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    await db.deleteFrom('organizacoes').where('id', '=', id).execute();
    reply.code(204);
  });

  app.get('/organizacoes/:id', async (req) => {
    const { id } = req.params as { id: string };
    exigirMembro(req, id);
    await expirarLiberacoesManuais();
    const o = await db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'codigo', 'status_assinatura', 'mp_token_cipher', 'mp_token_atualizado_em'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!o) throw erro.naoEncontrado();
    const liberacao = (await situacaoDasLiberacoes([id])).get(id);
    const cfg = await db
      .selectFrom('plataforma_config')
      .select('mensalidade_valor_centavos')
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    return {
      // Pagamento avulso (Pix/cartão sem conta) e liberação manual valem até o fim do mês.
      assinaturaAutomatica: liberacao?.pagaPeloMercadoPago ?? false,
      venceEm: vencimentoManual(liberacao),
      proximoMesAvulso: (() => {
        try {
          return proximoMesALiberar(liberacao?.ultimoPeriodoManual ?? null, new Date());
        } catch {
          return null;
        }
      })(),
      mensalidadeCentavos: cfg.mensalidade_valor_centavos,
      id: o.id,
      nome: o.nome,
      codigo: o.codigo,
      statusAssinatura: o.status_assinatura,
      mercadoPagoConectado: o.mp_token_cipher != null,
      mercadoPagoAtualizadoEm: o.mp_token_atualizado_em,
    };
  });

  // Auto-inscrição de jogador (via link de convite).
  app.post('/organizacoes/:id/entrar', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existe = await db
      .selectFrom('organizacoes')
      .select(['id', 'status_assinatura'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existe) throw erro.naoEncontrado('Organização não encontrada.');
    exigirOrganizacaoLiberada(existe.status_assinatura);

    await db
      .insertInto('organizacao_membros')
      .values({ organizacao_id: id, profile_id: req.usuario.id, papel: 'jogador' })
      .onConflict((oc) => oc.columns(['organizacao_id', 'profile_id']).doNothing())
      .execute();
    reply.code(201);
    return { ok: true };
  });

  // Entrar digitando o código curto da organização.
  app.post('/organizacoes/entrar-por-codigo', async (req, reply) => {
    const { codigo } = validar(entrarPorCodigoSchema, req.body);
    const org = await db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'status_assinatura'])
      .where('codigo', '=', codigo)
      .executeTakeFirst();
    if (!org) throw erro.naoEncontrado('Nenhuma organização com esse código.');
    exigirOrganizacaoLiberada(org.status_assinatura);

    await db
      .insertInto('organizacao_membros')
      .values({ organizacao_id: org.id, profile_id: req.usuario.id, papel: 'jogador' })
      .onConflict((oc) => oc.columns(['organizacao_id', 'profile_id']).doNothing())
      .execute();
    reply.code(201);
    return { id: org.id, nome: org.nome };
  });

  // Membro sai da organização por conta própria (o dono não pode sair — só encerrar).
  app.post('/organizacoes/:id/sair', async (req, reply) => {
    const { id } = req.params as { id: string };
    const vinculo = exigirMembro(req, id);
    if (vinculo.papel === 'admin_principal') {
      throw erro.invalido('O admin principal não pode sair. Encerre a organização se quiser sair.');
    }
    await db
      .deleteFrom('organizacao_membros')
      .where('organizacao_id', '=', id)
      .where('profile_id', '=', req.usuario.id)
      .execute();
    reply.code(204);
  });

  // ── Fase 3 — administração ────────────────────────────────────────────────
  // Qualquer membro pode ver a lista (visualização); ações seguem restritas a admins.
  app.get('/organizacoes/:id/membros', async (req) => {
    const { id } = req.params as { id: string };
    const vinculo = exigirMembro(req, id);
    const souAdmin = vinculo.papel === 'admin' || vinculo.papel === 'admin_principal';
    const membros = await db
      .selectFrom('organizacao_membros as m')
      .innerJoin('profiles as p', 'p.id', 'm.profile_id')
      .select([
        'p.id as profileId',
        'p.nome as nome',
        'p.telefone as telefone',
        'p.foto_url as fotoUrl',
        'p.foto_recortada as fotoRecortada',
        'p.senha_provisoria_ate as senhaProvisoriaAte',
        'm.papel as papel',
        'm.estrelas as estrelas',
        'm.ativo as ativo',
      ])
      .where('m.organizacao_id', '=', id)
      .orderBy('m.papel')
      .orderBy('p.nome')
      .execute();
    // Quais contas ainda estão com a senha 123456 só interessa a quem administra
    // — para os demais membros seria um mapa de contas fáceis de invadir.
    return membros.map(({ senhaProvisoriaAte, ...m }) => ({
      ...m,
      senhaProvisoria: souAdmin && senhaProvisoriaAte !== null,
    }));
  });

  // Admin cadastra um jogador (ex.: de um evento) só com nome e telefone. A conta
  // nasce com a senha provisória e entra na organização como jogador.
  app.post('/organizacoes/:id/jogadores-evento', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const { nome, telefone } = validar(criarJogadorEventoSchema, req.body);

    const org = await db
      .selectFrom('organizacoes')
      .select('status_assinatura')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    exigirOrganizacaoLiberada(org.status_assinatura);

    const validaAte = prazoSenhaProvisoria();
    const senha_hash = await hashSenha(SENHA_PROVISORIA);
    let profileId: string;
    try {
      profileId = await db.transaction().execute(async (tx) => {
        const novo = await tx
          .insertInto('profiles')
          .values({ nome, telefone, senha_hash, senha_provisoria_ate: validaAte })
          .returning('id')
          .executeTakeFirstOrThrow();
        await tx
          .insertInto('organizacao_membros')
          .values({ organizacao_id: id, profile_id: novo.id, papel: 'jogador' })
          .execute();
        return novo.id;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw erro.conflito('Já existe uma conta com esse telefone. Use "Já tem cadastro?" para adicioná-la.');
      }
      throw e;
    }

    reply.code(201);
    return { profileId, nome, telefone, senhaProvisoria: SENHA_PROVISORIA, validaAte };
  });

  // Volta a conta para a senha provisória. Só vale para contas que AINDA estão
  // com a provisória (a pessoa nunca definiu a própria): senão um admin poderia
  // tomar a conta de qualquer membro que tenha senha de verdade.
  app.post('/organizacoes/:id/membros/redefinir-senha', async (req) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const { profileId } = validar(redefinirSenhaJogadorSchema, req.body);

    const alvo = await db
      .selectFrom('organizacao_membros as m')
      .innerJoin('profiles as p', 'p.id', 'm.profile_id')
      .select('p.senha_provisoria_ate as senhaProvisoriaAte')
      .where('m.organizacao_id', '=', id)
      .where('m.profile_id', '=', profileId)
      .executeTakeFirst();
    if (!alvo) throw erro.naoEncontrado('Membro não encontrado.');
    if (alvo.senhaProvisoriaAte === null) {
      throw erro.proibido('Só dá para redefinir a senha de quem ainda não definiu a própria.');
    }

    const validaAte = prazoSenhaProvisoria();
    await db
      .updateTable('profiles')
      .set({ senha_hash: await hashSenha(SENHA_PROVISORIA), senha_provisoria_ate: validaAte })
      .where('id', '=', profileId)
      .execute();
    await revogarSessoes(profileId);
    return { senhaProvisoria: SENHA_PROVISORIA, validaAte };
  });

  // Admin busca (por nome ou telefone) contas já cadastradas para adicionar à organização.
  app.get('/organizacoes/:id/membros/buscar', async (req) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const q = ((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return [];
    const digitos = q.replace(/\D/g, '');

    return db
      .selectFrom('profiles as p')
      .leftJoin('organizacao_membros as m', (join) =>
        join.onRef('m.profile_id', '=', 'p.id').on('m.organizacao_id', '=', id),
      )
      .select([
        'p.id as profileId',
        'p.nome as nome',
        'p.telefone as telefone',
        'p.foto_url as fotoUrl',
        'p.foto_recortada as fotoRecortada',
      ])
      .where('m.profile_id', 'is', null)
      .where((eb) => {
        const condicoes = [eb('p.nome', 'ilike', `%${q}%`)];
        if (digitos.length > 0) condicoes.push(eb('p.telefone', 'like', `%${digitos}%`));
        return eb.or(condicoes);
      })
      .orderBy('p.nome')
      .limit(6)
      .execute();
  });

  // Admin adiciona à organização um jogador que já tem cadastro (escolhido na busca).
  app.post('/organizacoes/:id/membros/adicionar', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const { profileId } = validar(adicionarMembroSchema, req.body);

    const orgAdd = await db
      .selectFrom('organizacoes')
      .select('status_assinatura')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    exigirOrganizacaoLiberada(orgAdd.status_assinatura);

    const perfil = await db
      .selectFrom('profiles')
      .select('id')
      .where('id', '=', profileId)
      .executeTakeFirst();
    if (!perfil) throw erro.naoEncontrado('Conta não encontrada.');

    const r = await db
      .insertInto('organizacao_membros')
      .values({ organizacao_id: id, profile_id: perfil.id, papel: 'jogador' })
      .onConflict((oc) => oc.columns(['organizacao_id', 'profile_id']).doNothing())
      .executeTakeFirst();
    if (r.numInsertedOrUpdatedRows === 0n) {
      throw erro.conflito('Esta pessoa já faz parte da organização.');
    }
    reply.code(201);
    return { ok: true };
  });

  // Admin remove um membro da organização (admin comum não remove outro admin).
  app.post('/organizacoes/:id/membros/remover', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const { profileId } = validar(removerMembroSchema, req.body);
    if (profileId === req.usuario.id) {
      throw erro.invalido('Use a opção "Sair da organização" para remover a si mesmo.');
    }
    const alvo = await db
      .selectFrom('organizacao_membros')
      .select('papel')
      .where('organizacao_id', '=', id)
      .where('profile_id', '=', profileId)
      .executeTakeFirst();
    if (!alvo) throw erro.naoEncontrado('Membro não encontrado.');
    if (alvo.papel === 'admin_principal') {
      throw erro.proibido('Não é possível remover o admin principal.');
    }
    if (alvo.papel === 'admin') {
      exigirDono(req, id);
    }
    await db
      .deleteFrom('organizacao_membros')
      .where('organizacao_id', '=', id)
      .where('profile_id', '=', profileId)
      .execute();
    reply.code(204);
  });

  app.post('/organizacoes/:id/membros/promover', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    const { profileId, papel } = validar(promoverMembroSchema, req.body);
    if (profileId === req.usuario.id) {
      throw erro.invalido('Você não pode alterar o próprio papel.');
    }
    try {
      const r = await db
        .updateTable('organizacao_membros')
        .set({ papel })
        .where('organizacao_id', '=', id)
        .where('profile_id', '=', profileId)
        .where('papel', '!=', 'admin_principal')
        .executeTakeFirst();
      if (r.numUpdatedRows === 0n) throw erro.naoEncontrado('Membro não encontrado.');
    } catch (e) {
      if (ehViolacaoDeCheck(e)) {
        throw erro.conflito('Esta organização já tem 5 administradores ativos.');
      }
      throw e;
    }
    return { ok: true };
  });

  app.post('/organizacoes/:id/membros/estrelas', async (req) => {
    const { id } = req.params as { id: string };
    exigirAdmin(req, id);
    const { profileId, estrelas } = validar(ajustarEstrelasSchema, req.body);
    const r = await db
      .updateTable('organizacao_membros')
      .set({ estrelas })
      .where('organizacao_id', '=', id)
      .where('profile_id', '=', profileId)
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw erro.naoEncontrado('Membro não encontrado.');
    return { ok: true };
  });

  // ── Fase 6 — conectar o Mercado Pago da organização ───────────────────────
  app.post('/organizacoes/:id/mercadopago', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    const { accessToken } = validar(conectarMercadoPagoSchema, req.body);

    const { cipher, nonce } = cifrarTokenOuErro(accessToken);
    await db
      .updateTable('organizacoes')
      .set({
        mp_token_cipher: cipher,
        mp_token_nonce: nonce,
        mp_token_atualizado_em: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  // Dono inicia o pagamento da mensalidade (cria a assinatura recorrente no MP).
  app.post('/organizacoes/:id/assinatura/checkout', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    const { payerEmail } = validar(iniciarCheckoutSchema, req.body);

    const org = await db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'status_assinatura'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!org) throw erro.naoEncontrado('Organização não encontrada.');
    if (!podeIniciarCheckout(org.status_assinatura)) {
      throw erro.conflito('Esta organização já está com a mensalidade em dia.');
    }

    const cfg = await db
      .selectFrom('plataforma_config')
      .select(['mensalidade_valor_centavos', 'mp_geral_token_cipher', 'mp_geral_token_nonce'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();

    if (!cfg.mp_geral_token_cipher || !cfg.mp_geral_token_nonce) {
      throw erro.invalido('Conta Mercado Pago da plataforma ainda não configurada.');
    }

    const periodoStr = primeiroDiaDoMesUtc(new Date());

    let preapproval;
    try {
      const tokenGeral = decifrarToken(cfg.mp_geral_token_cipher, cfg.mp_geral_token_nonce);
      preapproval = await criarPreapproval({
        accessToken: tokenGeral,
        reason: `Mensalidade Resenha05 - ${org.nome}`,
        externalReference: `${org.id}:${periodoStr}`,
        payerEmail,
        valorCentavos: cfg.mensalidade_valor_centavos,
        backUrl: `${env.WEB_ORIGIN}/org/${org.id}/assinatura`,
      });
    } catch (e) {
      req.log.error({ err: e }, 'Falha ao criar a assinatura no Mercado Pago');
      throw traduzirErroCobranca(e, req.usuario.papelPlataforma != null);
    }

    await db
      .insertInto('assinaturas')
      .values({
        organizacao_id: org.id,
        mp_preapproval_id: preapproval.id,
        periodo_referencia: periodoStr,
        valor_centavos: cfg.mensalidade_valor_centavos,
        status: 'pendente',
      })
      .onConflict((oc) =>
        oc.columns(['mp_preapproval_id', 'periodo_referencia']).doUpdateSet({
          valor_centavos: cfg.mensalidade_valor_centavos,
          atualizado_em: new Date(),
        }),
      )
      .execute();

    return { checkoutUrl: preapproval.initPoint };
  });

  // Dono paga o próximo mês por Pix ou cartão, como convidado (sem conta no
  // Mercado Pago). Não renova sozinho: vale até o fim do mês pago.
  app.post('/organizacoes/:id/assinatura/avulso', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);

    const org = await db.selectFrom('organizacoes').select(['id', 'nome']).where('id', '=', id).executeTakeFirst();
    if (!org) throw erro.naoEncontrado('Organização não encontrada.');

    await expirarLiberacoesManuais();
    const situacao = (await situacaoDasLiberacoes([id])).get(id);
    if (situacao?.pagaPeloMercadoPago) {
      throw erro.conflito('Esta organização já tem assinatura automática no Mercado Pago.');
    }
    let periodo: string;
    try {
      periodo = proximoMesALiberar(situacao?.ultimoPeriodoManual ?? null, new Date());
    } catch (e) {
      throw erro.conflito(e instanceof Error ? e.message : 'Não dá para pagar mais meses adiantado.');
    }

    const token = await tokenDaPlataforma();
    if (!token) throw erro.invalido('Conta Mercado Pago da plataforma ainda não configurada.');
    const cfg = await db
      .selectFrom('plataforma_config')
      .select('mensalidade_valor_centavos')
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();

    // A linha pendente nasce antes do pagamento: é ela que o Mercado Pago aponta de volta.
    const chave = randomUUID();
    await db
      .insertInto('assinaturas')
      .values({
        organizacao_id: id,
        mp_preapproval_id: idPagamentoAvulso(chave),
        periodo_referencia: periodo,
        valor_centavos: cfg.mensalidade_valor_centavos,
        status: 'pendente',
      })
      .execute();

    try {
      const preferencia = await criarPreferencia({
        accessToken: token,
        titulo: `Mensalidade Resenha05 ${periodo.slice(5, 7)}/${periodo.slice(0, 4)} - ${org.nome}`,
        valorCentavos: cfg.mensalidade_valor_centavos,
        externalReference: referenciaDoPagamentoAvulso(chave),
        backUrl: `${env.WEB_ORIGIN}/org/${id}/assinatura`,
        notificationUrl: `${env.WEB_ORIGIN}/api/webhooks/mercadopago/assinatura`,
      });
      return { checkoutUrl: preferencia.initPoint, periodoReferencia: periodo };
    } catch (e) {
      await db.deleteFrom('assinaturas').where('mp_preapproval_id', '=', idPagamentoAvulso(chave)).execute();
      req.log.error({ err: e }, 'Falha ao criar o pagamento avulso no Mercado Pago');
      throw traduzirErroCobranca(e, req.usuario.papelPlataforma != null);
    }
  });

  // O comprador volta do Mercado Pago com o número do pagamento: confere na hora (sem esperar o webhook).
  app.post('/organizacoes/:id/assinatura/avulso/conferir', async (req) => {
    const { id } = req.params as { id: string };
    exigirDono(req, id);
    const { paymentId } = validar(confirmarPagamentoAvulsoSchema, req.body);
    const token = await tokenDaPlataforma();
    if (!token) throw erro.invalido('Conta Mercado Pago da plataforma ainda não configurada.');
    try {
      const r = await conferirPagamentoAvulso(token, paymentId, id);
      return { resultado: r.decisao, statusMp: r.statusMp, periodoReferencia: r.periodoReferencia };
    } catch (e) {
      req.log.error({ err: e }, 'Falha ao conferir o pagamento avulso');
      throw traduzirErroCobranca(e, req.usuario.papelPlataforma != null);
    }
  });
};
