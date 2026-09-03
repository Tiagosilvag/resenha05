import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SessaoUsuario } from '@resenha05/shared';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { sha256 } from './cripto.js';
import { erro } from './erros.js';

/** Monta o objeto do usuário logado (perfil + organizações onde é membro). */
export async function carregarUsuario(profileId: string): Promise<SessaoUsuario> {
  const p = await db
    .selectFrom('profiles')
    .select([
      'id',
      'nome',
      'telefone',
      'foto_url',
      'foto_recortada',
      'time_coracao',
      'telefone_verificado_em',
    ])
    .where('id', '=', profileId)
    .executeTakeFirst();

  if (!p) throw erro.naoAutorizado('Sessão inválida.');

  const orgs = await db
    .selectFrom('organizacao_membros as m')
    .innerJoin('organizacoes as o', 'o.id', 'm.organizacao_id')
    .select(['o.id as id', 'o.nome as nome', 'm.papel as papel', 'm.estrelas as estrelas'])
    .where('m.profile_id', '=', profileId)
    .where('m.ativo', '=', true)
    .orderBy('o.nome')
    .execute();

  return {
    id: p.id,
    nome: p.nome,
    telefone: p.telefone,
    fotoUrl: p.foto_url,
    fotoRecortada: p.foto_recortada,
    timeCoracao: p.time_coracao,
    telefoneVerificado: p.telefone_verificado_em != null,
    organizacoes: orgs.map((o) => ({
      id: o.id,
      nome: o.nome,
      papel: o.papel,
      estrelas: o.estrelas,
    })),
  };
}

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  expiraEm: string;
}

/** Cria o access JWT + um refresh token novo persistido em `sessoes`. */
export async function emitirTokens(
  app: FastifyInstance,
  profileId: string,
  userAgent: string | null,
): Promise<ParDeTokens> {
  const accessToken = app.jwt.sign({ sub: profileId }, { expiresIn: env.ACCESS_TOKEN_TTL });

  const refreshToken = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DIAS * 86_400_000);

  await db
    .insertInto('sessoes')
    .values({
      profile_id: profileId,
      token_hash: sha256(refreshToken),
      user_agent: userAgent?.slice(0, 300) ?? null,
      expira_em: expiraEm,
    })
    .execute();

  return { accessToken, refreshToken, expiraEm: expiraEm.toISOString() };
}

/** Valida o refresh recebido, revoga o antigo e emite um par novo (rotação). */
export async function rotacionarRefresh(
  app: FastifyInstance,
  refreshToken: string,
  userAgent: string | null,
): Promise<ParDeTokens> {
  const hash = sha256(refreshToken);
  const sessao = await db
    .selectFrom('sessoes')
    .select(['id', 'profile_id', 'expira_em', 'revogado_em'])
    .where('token_hash', '=', hash)
    .executeTakeFirst();

  if (!sessao || sessao.revogado_em || new Date(sessao.expira_em) < new Date()) {
    throw erro.naoAutorizado('Sessão expirada. Faça login de novo.');
  }

  await db
    .updateTable('sessoes')
    .set({ revogado_em: new Date() })
    .where('id', '=', sessao.id)
    .execute();

  return emitirTokens(app, sessao.profile_id, userAgent);
}

export async function revogarSessoes(profileId: string): Promise<void> {
  await db
    .updateTable('sessoes')
    .set({ revogado_em: new Date() })
    .where('profile_id', '=', profileId)
    .where('revogado_em', 'is', null)
    .execute();
}
