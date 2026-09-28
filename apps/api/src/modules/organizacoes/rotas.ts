import type { FastifyPluginAsync } from 'fastify';
import {
  criarOrganizacaoSchema,
  entrarPorCodigoSchema,
  promoverMembroSchema,
  ajustarEstrelasSchema,
  adicionarMembroSchema,
  removerMembroSchema,
  conectarMercadoPagoSchema,
  podeIniciarCheckout,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { exigirAdmin, exigirDono, exigirMembro } from '../../plugins/auth.js';
import { cifrarToken, decifrarToken } from '../../lib/cripto.js';
import { criarPreapproval } from '../../lib/mercadopago-preapproval.js';
import { exigirOrganizacaoLiberada, traduzirErroCobranca } from '../../lib/assinatura.js';
import { primeiroDiaDoMesUtc } from '../../lib/periodo.js';
import { env } from '../../env.js';

function ehViolacaoDeCheck(e: unknown): boolean {
  return (e as { code?: string }).code === '23514';
}

export const rotasOrganizacoes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  // Cria uma organização e torna o criador admin_principal.
  app.post('/organizacoes', async (req, reply) => {
    const { nome } = validar(criarOrganizacaoSchema, req.body);
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
    const o = await db
      .selectFrom('organizacoes')
      .select(['id', 'nome', 'codigo', 'status_assinatura', 'mp_token_cipher', 'mp_token_atualizado_em'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!o) throw erro.naoEncontrado();
    return {
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
    exigirMembro(req, id);
    return db
      .selectFrom('organizacao_membros as m')
      .innerJoin('profiles as p', 'p.id', 'm.profile_id')
      .select([
        'p.id as profileId',
        'p.nome as nome',
        'p.telefone as telefone',
        'p.foto_url as fotoUrl',
        'p.foto_recortada as fotoRecortada',
        'm.papel as papel',
        'm.estrelas as estrelas',
        'm.ativo as ativo',
      ])
      .where('m.organizacao_id', '=', id)
      .orderBy('m.papel')
      .orderBy('p.nome')
      .execute();
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

    let cipher: Buffer;
    let nonce: Buffer;
    try {
      ({ cipher, nonce } = cifrarToken(accessToken));
    } catch {
      throw erro.invalido('Servidor sem chave de criptografia configurada (RESENHA05_ENC_KEY).');
    }
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

    // O MP exige um e-mail no preapproval, mas o cadastro não coleta e-mail do
    // dono: usa um sintético só para satisfazer o campo (quem interage é o
    // dono, dentro do checkout do MP).
    let preapproval;
    try {
      const tokenGeral = decifrarToken(cfg.mp_geral_token_cipher, cfg.mp_geral_token_nonce);
      preapproval = await criarPreapproval({
        accessToken: tokenGeral,
        reason: `Mensalidade Resenha05 - ${org.nome}`,
        externalReference: `${org.id}:${periodoStr}`,
        payerEmail: req.usuario.telefone.replace(/\D/g, '') + '@resenha05.invalid',
        valorCentavos: cfg.mensalidade_valor_centavos,
        backUrl: `${env.WEB_ORIGIN}/org/${org.id}/assinatura`,
      });
    } catch (e) {
      req.log.error({ err: e }, 'Falha ao criar a assinatura no Mercado Pago');
      throw traduzirErroCobranca(e);
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
};
