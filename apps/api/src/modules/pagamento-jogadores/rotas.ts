import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import {
  configurarPagamentoJogadoresSchema,
  confirmarPagamentoAvulsoSchema,
  referenciaDoPagamentoJogador,
  valorEmCentavos,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { env } from '../../env.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirDonoOuAdminPlataforma, exigirMembro } from '../../plugins/auth.js';
import { cifrarTokenOuErro } from '../../lib/cripto.js';
import { MercadoPagoErro } from '../../lib/mercadopago-preapproval.js';
import { criarPreferencia } from '../../lib/mercadopago-preferencia.js';
import { gerarPkce, trocarCodigo, urlDeAutorizacao } from '../../lib/mercadopago-oauth.js';
import { oauthConfigurado, tokenDaOrganizacao } from '../../lib/mp-organizacao.js';
import { conferirPagamentoJogador } from '../../lib/pagamento-jogador.js';
import { traduzirErroCobranca } from '../../lib/assinatura.js';

const VALIDADE_DO_ESTADO_MS = 15 * 60 * 1000;

function redirectUriOAuth(): string {
  return `${env.WEB_ORIGIN}/api/oauth/mercadopago/callback`;
}

/** Pelada + organização (modo de pagamento) de quem está fazendo a requisição, já como membro. */
async function contexto(req: FastifyRequest, peladaId: string) {
  const p = await db
    .selectFrom('peladas as pe')
    .innerJoin('organizacoes as o', 'o.id', 'pe.organizacao_id')
    .select([
      'pe.id as id',
      'pe.organizacao_id as organizacaoId',
      'pe.valor as valor',
      'pe.status as status',
      'pe.data as data',
      'o.nome as organizacaoNome',
      'o.pagamento_jogador_modo as modo',
    ])
    .where('pe.id', '=', peladaId)
    .executeTakeFirst();
  if (!p) throw erro.naoEncontrado('Pelada não encontrada.');
  exigirMembro(req, p.organizacaoId);
  return p;
}

async function minhaPresenca(peladaId: string, profileId: string) {
  return db
    .selectFrom('presencas')
    .select(['status', 'pagamento_declarado_em'])
    .where('pelada_id', '=', peladaId)
    .where('profile_id', '=', profileId)
    .executeTakeFirst();
}

export const rotasPagamentoJogadores: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  // --- Configuração da organização (o dono decide como os jogadores pagam) ------------------

  app.get('/organizacoes/:id/pagamento-jogadores', async (req) => {
    const { id } = req.params as { id: string };
    const vinculo = exigirAdmin(req, id);
    const o = await db
      .selectFrom('organizacoes')
      .select([
        'pagamento_jogador_modo',
        'pix_chave',
        'pix_favorecido',
        'pix_instrucoes',
        'mp_oauth_access_cipher',
        'mp_oauth_conectado_em',
        'mp_oauth_expira_em',
        'mp_token_cipher',
      ])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!o) throw erro.naoEncontrado('Organização não encontrada.');
    const origem = o.mp_oauth_access_cipher ? 'oauth' : o.mp_token_cipher ? 'token' : null;
    return {
      souDono: vinculo.papel === 'admin_principal' || req.usuario.papelPlataforma != null,
      modo: o.pagamento_jogador_modo,
      pix: { chave: o.pix_chave, favorecido: o.pix_favorecido, instrucoes: o.pix_instrucoes },
      mercadoPago: {
        conectado: origem !== null,
        origem,
        conectadoEm: o.mp_oauth_conectado_em,
        venceEm: o.mp_oauth_expira_em,
        oauthDisponivel: oauthConfigurado(),
      },
    };
  });

  app.put('/organizacoes/:id/pagamento-jogadores', async (req) => {
    const { id } = req.params as { id: string };
    exigirDonoOuAdminPlataforma(req, id);
    const d = validar(configurarPagamentoJogadoresSchema, req.body);

    if (d.modo === 'mercadopago') {
      const o = await db
        .selectFrom('organizacoes')
        .select(['mp_oauth_access_cipher', 'mp_token_cipher'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      if (!o.mp_oauth_access_cipher && !o.mp_token_cipher) {
        throw erro.conflito('Conecte sua conta do Mercado Pago antes de escolher o pagamento automático.');
      }
    }

    await db
      .updateTable('organizacoes')
      .set({
        pagamento_jogador_modo: d.modo,
        ...(d.pixChave !== undefined ? { pix_chave: d.pixChave || null } : {}),
        ...(d.pixFavorecido !== undefined ? { pix_favorecido: d.pixFavorecido || null } : {}),
        ...(d.pixInstrucoes !== undefined ? { pix_instrucoes: d.pixInstrucoes || null } : {}),
      })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  // --- "Conectar com Mercado Pago" (OAuth): o dono só entra na conta dele e autoriza ------------

  app.post('/organizacoes/:id/mercadopago/oauth/iniciar', async (req) => {
    const { id } = req.params as { id: string };
    exigirDonoOuAdminPlataforma(req, id);
    if (!oauthConfigurado()) {
      throw erro.conflito('A conexão automática ainda não está disponível. Fale com o suporte.');
    }
    const estado = randomBytes(24).toString('hex');
    const pkce = env.MP_OAUTH_PKCE === '1' ? gerarPkce() : null;
    await db
      .insertInto('oauth_estados')
      .values({ estado, organizacao_id: id, code_verifier: pkce?.verifier ?? null, criado_por: req.usuario.id })
      .execute();
    return {
      url: urlDeAutorizacao({
        clientId: env.MP_OAUTH_CLIENT_ID!,
        redirectUri: redirectUriOAuth(),
        estado,
        ...(pkce ? { codeChallenge: pkce.challenge } : {}),
      }),
    };
  });

  app.delete('/organizacoes/:id/mercadopago/oauth', async (req, reply) => {
    const { id } = req.params as { id: string };
    exigirDonoOuAdminPlataforma(req, id);
    await db
      .updateTable('organizacoes')
      .set({
        mp_oauth_user_id: null,
        mp_oauth_access_cipher: null,
        mp_oauth_access_nonce: null,
        mp_oauth_refresh_cipher: null,
        mp_oauth_refresh_nonce: null,
        mp_oauth_expira_em: null,
        mp_oauth_conectado_em: null,
      })
      .where('id', '=', id)
      .execute();
    // Sem conta ligada, o pagamento automático não funciona: volta para o manual.
    await db
      .updateTable('organizacoes')
      .set({ pagamento_jogador_modo: 'manual' })
      .where('id', '=', id)
      .where('pagamento_jogador_modo', '=', 'mercadopago')
      .where('mp_token_cipher', 'is', null)
      .execute();
    reply.code(204);
  });

  // --- Jogador: modo Pix ("já paguei") -----------------------------------------------------------

  app.post('/peladas/:peladaId/pagamento/declarar', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const p = await contexto(req, peladaId);
    if (p.modo !== 'pix') throw erro.conflito('Esta organização não usa pagamento por Pix.');
    if (!valorEmCentavos(p.valor)) throw erro.conflito('Esta pelada é grátis.');

    const presenca = await minhaPresenca(peladaId, req.usuario.id);
    if (!presenca || presenca.status === 'desistiu') throw erro.conflito('Confirme sua presença antes de avisar o pagamento.');
    if (presenca.status === 'pago') return { ok: true, status: 'pago' };

    await db
      .updateTable('presencas')
      .set({ pagamento_declarado_em: new Date() })
      .where('pelada_id', '=', peladaId)
      .where('profile_id', '=', req.usuario.id)
      .where('pagamento_declarado_em', 'is', null)
      .execute();
    return { ok: true, status: 'aguardando_confirmacao' };
  });

  // --- Jogador: modo Mercado Pago (Pix ou cartão, sem precisar de conta) -------------------------

  app.post('/peladas/:peladaId/pagamento/mercadopago', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const p = await contexto(req, peladaId);
    if (p.modo !== 'mercadopago') throw erro.conflito('Esta organização não usa pagamento automático.');
    const centavos = valorEmCentavos(p.valor);
    if (!centavos) throw erro.conflito('Esta pelada é grátis.');

    const presenca = await minhaPresenca(peladaId, req.usuario.id);
    if (!presenca || presenca.status === 'desistiu') throw erro.conflito('Confirme sua presença antes de pagar.');
    if (presenca.status === 'pago') throw erro.conflito('Você já pagou esta pelada.');

    const conta = await tokenDaOrganizacao(p.organizacaoId);
    if (!conta) throw erro.conflito('O organizador ainda não conectou a conta do Mercado Pago.');

    const cobranca = await db
      .insertInto('pagamentos_jogador')
      .values({
        organizacao_id: p.organizacaoId,
        pelada_id: peladaId,
        profile_id: req.usuario.id,
        valor_centavos: centavos,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    try {
      const [ano, mes, dia] = String(p.data).slice(0, 10).split('-');
      const preferencia = await criarPreferencia({
        accessToken: conta.token,
        titulo: `Pelada ${dia}/${mes}/${ano} - ${p.organizacaoNome}`,
        valorCentavos: centavos,
        externalReference: referenciaDoPagamentoJogador(cobranca.id),
        backUrl: `${env.WEB_ORIGIN}/peladas/${peladaId}`,
        notificationUrl: `${env.WEB_ORIGIN}/api/webhooks/mercadopago/pagamento-jogador/${p.organizacaoId}`,
      });
      return { checkoutUrl: preferencia.initPoint };
    } catch (e) {
      await db.deleteFrom('pagamentos_jogador').where('id', '=', cobranca.id).execute();
      req.log.error({ err: e }, 'Falha ao criar o pagamento do jogador no Mercado Pago');
      throw traduzirErroCobranca(e, false);
    }
  });

  // Volta do Mercado Pago com ?payment_id=...: confere na hora, sem esperar o aviso.
  app.post('/peladas/:peladaId/pagamento/mercadopago/conferir', async (req) => {
    const { peladaId } = req.params as { peladaId: string };
    const p = await contexto(req, peladaId);
    const { paymentId } = validar(confirmarPagamentoAvulsoSchema, req.body);
    const conta = await tokenDaOrganizacao(p.organizacaoId);
    if (!conta) throw erro.conflito('O organizador ainda não conectou a conta do Mercado Pago.');
    try {
      const r = await conferirPagamentoJogador(conta.token, p.organizacaoId, paymentId, {
        peladaId,
        profileId: req.usuario.id,
      });
      return { resultado: r.decisao, statusMp: r.statusMp };
    } catch (e) {
      req.log.error({ err: e }, 'Falha ao conferir o pagamento do jogador');
      throw traduzirErroCobranca(e, false);
    }
  });
};

/** Rotas sem login: quem chama é o navegador voltando do Mercado Pago ou o próprio Mercado Pago. */
export const rotasPublicasPagamentoJogadores: FastifyPluginAsync = async (app) => {
  app.get('/oauth/mercadopago/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const paginaDaOrg = (orgId: string, params: string) =>
      reply.redirect(`${env.WEB_ORIGIN}/org/${orgId}/mercadopago?${params}`);

    // O estado vale uma vez só: é apagado ao ser lido.
    const e = q.state
      ? await db.deleteFrom('oauth_estados').where('estado', '=', q.state).returningAll().executeTakeFirst()
      : undefined;
    if (!e || Date.now() - new Date(e.criado_em as unknown as string).getTime() > VALIDADE_DO_ESTADO_MS) {
      return reply.redirect(`${env.WEB_ORIGIN}/?mercadopago=erro`);
    }
    if (q.error || !q.code || !oauthConfigurado()) return paginaDaOrg(e.organizacao_id, 'erro=negado');

    try {
      const t = await trocarCodigo({
        clientId: env.MP_OAUTH_CLIENT_ID!,
        clientSecret: env.MP_OAUTH_CLIENT_SECRET!,
        code: q.code,
        redirectUri: redirectUriOAuth(),
        ...(e.code_verifier ? { codeVerifier: e.code_verifier } : {}),
      });
      const access = cifrarTokenOuErro(t.accessToken);
      const refresh = cifrarTokenOuErro(t.refreshToken);
      await db
        .updateTable('organizacoes')
        .set({
          mp_oauth_user_id: t.userId,
          mp_oauth_access_cipher: access.cipher,
          mp_oauth_access_nonce: access.nonce,
          mp_oauth_refresh_cipher: refresh.cipher,
          mp_oauth_refresh_nonce: refresh.nonce,
          mp_oauth_expira_em: new Date(Date.now() + t.expiraEmSeg * 1000),
          mp_oauth_conectado_em: new Date(),
        })
        .where('id', '=', e.organizacao_id)
        .execute();
      return paginaDaOrg(e.organizacao_id, 'conectado=1');
    } catch (err) {
      req.log.error({ err }, 'Falha ao concluir a conexão OAuth com o Mercado Pago');
      return paginaDaOrg(e.organizacao_id, 'erro=falha');
    }
  });

  // Aviso de pagamento de jogador. Não confiamos no conteúdo: o pagamento é reconsultado
  // no Mercado Pago com o token da organização antes de marcar alguém como pago.
  app.post('/webhooks/mercadopago/pagamento-jogador/:orgId', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const q = req.query as { 'data.id'?: string; id?: string; topic?: string; type?: string };
    const body = (req.body ?? {}) as { type?: string; data?: { id?: string } };
    const ehPagamento = body.type === 'payment' || q.type === 'payment' || q.topic === 'payment';
    const pagamentoId = String(q['data.id'] ?? body.data?.id ?? q.id ?? '');
    if (!ehPagamento || !/^\d{5,20}$/.test(pagamentoId) || !/^[0-9a-f-]{36}$/i.test(orgId)) {
      reply.code(200);
      return { ok: true };
    }
    try {
      const conta = await tokenDaOrganizacao(orgId);
      if (conta) {
        const r = await conferirPagamentoJogador(conta.token, orgId, pagamentoId);
        req.log.info({ pagamentoId, decisao: r.decisao }, 'Aviso de pagamento de jogador processado');
      }
    } catch (e) {
      // Pagamento que o Mercado Pago não conhece (404): nada a fazer. Outras falhas pedem reenvio.
      if (e instanceof MercadoPagoErro && e.status === 404) {
        reply.code(200);
        return { ok: true };
      }
      req.log.error({ err: e, pagamentoId }, 'Falha ao processar aviso de pagamento de jogador');
      reply.code(500);
      return { erro: 'Não foi possível processar agora.' };
    }
    reply.code(200);
    return { ok: true };
  });
};
