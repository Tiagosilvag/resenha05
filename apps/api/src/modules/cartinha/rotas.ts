import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'kysely';
import { db } from '../../db/index.js';
import { erro } from '../../lib/erros.js';
import { UPLOADS_DIR } from '../../lib/uploads.js';
import { renderCartinhaPng, type DadosCartinha } from '../../lib/cartinha.js';

const DIR_CARDS = join(UPLOADS_DIR, 'cards');
// Suba quando o layout da cartinha mudar, para invalidar o cache do volume.
const VERSAO_LAYOUT = 5;

/** Descobre uma organização em comum entre quem pede e o alvo. */
async function orgComum(req: FastifyRequest, alvo: string, preferida?: string): Promise<string> {
  const minhas = new Set(req.usuario.organizacoes.map((o) => o.id));
  if (alvo === req.usuario.id) {
    const escolhida = preferida && minhas.has(preferida) ? preferida : [...minhas][0];
    if (!escolhida) throw erro.invalido('Entre numa organização para gerar sua cartinha.');
    return escolhida;
  }
  const doAlvo = await db
    .selectFrom('organizacao_membros')
    .select('organizacao_id')
    .where('profile_id', '=', alvo)
    .where('ativo', '=', true)
    .execute();
  const comuns = doAlvo.map((r) => r.organizacao_id).filter((id) => minhas.has(id));
  const escolhida = preferida && comuns.includes(preferida) ? preferida : comuns[0];
  if (!escolhida) throw erro.proibido('Você não divide organização com esse jogador.');
  return escolhida;
}

async function montarDados(profileId: string, orgId: string): Promise<DadosCartinha> {
  const p = await db
    .selectFrom('profiles')
    .select(['id', 'nome', 'foto_url', 'foto_recortada'])
    .where('id', '=', profileId)
    .executeTakeFirst();
  if (!p) throw erro.naoEncontrado('Jogador não encontrado.');

  const [membro, extra, ev, jogosRow] = await Promise.all([
    db
      .selectFrom('organizacao_membros')
      .select('estrelas')
      .where('organizacao_id', '=', orgId)
      .where('profile_id', '=', profileId)
      .executeTakeFirst(),
    db
      .selectFrom('perfil_extra')
      .select(['posicao', 'pe_preferido'])
      .where('profile_id', '=', profileId)
      .executeTakeFirst(),
    db
      .selectFrom('v_eventos_jogador')
      .select([
        sql<number>`count(*) filter (where tipo = 'gol')`.as('gols'),
        sql<number>`count(*) filter (where tipo = 'assistencia')`.as('assist'),
        sql<number>`count(*) filter (where tipo in ('cartao_amarelo','cartao_vermelho'))`.as('cartoes'),
      ])
      .where('organizacao_id', '=', orgId)
      .where('profile_id', '=', profileId)
      .executeTakeFirst(),
    db
      .selectFrom('presencas as pr')
      .innerJoin('peladas as pl', 'pl.id', 'pr.pelada_id')
      .select(sql<number>`count(*)`.as('jogos'))
      .where('pl.organizacao_id', '=', orgId)
      .where('pr.profile_id', '=', profileId)
      .where('pr.status', 'in', ['confirmado', 'pago'])
      .executeTakeFirst(),
  ]);

  return {
    profileId,
    nome: p.nome,
    fotoUrl: p.foto_url,
    fotoRecortada: p.foto_recortada,
    estrelas: membro?.estrelas ?? 3,
    posicao: (extra?.posicao as DadosCartinha['posicao']) ?? null,
    pePreferido: extra?.pe_preferido ?? null,
    desempenho: {
      jogos: Number(jogosRow?.jogos ?? 0),
      gols: Number(ev?.gols ?? 0),
      assistencias: Number(ev?.assist ?? 0),
      cartoes: Number(ev?.cartoes ?? 0),
    },
  };
}

async function servirComCache(reply: FastifyReply, chave: string, gerar: () => Promise<Buffer>) {
  await mkdir(DIR_CARDS, { recursive: true });
  const arquivo = join(DIR_CARDS, `${chave}.png`);
  let png: Buffer;
  try {
    png = await readFile(arquivo);
  } catch {
    png = await gerar();
    // limpa versões antigas do mesmo jogador (prefixo antes do primeiro '-')
    const jogador = chave.split('-')[0];
    try {
      for (const f of await readdir(DIR_CARDS)) {
        if (f.startsWith(`${jogador}-`) && f !== `${chave}.png`) {
          await rm(join(DIR_CARDS, f), { force: true });
        }
      }
    } catch {
      /* ok */
    }
    await writeFile(arquivo, png);
  }
  reply.header('content-type', 'image/png').header('cache-control', 'public, max-age=300').send(png);
}

export const rotasCartinha: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  app.get('/jogadores/:profileId/cartinha.png', async (req, reply) => {
    const { profileId } = req.params as { profileId: string };
    const { org } = req.query as { org?: string };
    const orgId = await orgComum(req, profileId, org);
    const dados = await montarDados(profileId, orgId);
    const chave = `${profileId}-${createHash('sha1')
      .update(JSON.stringify([VERSAO_LAYOUT, dados.fotoUrl, dados.fotoRecortada, dados.estrelas, dados.posicao, dados.pePreferido, dados.desempenho]))
      .digest('hex')
      .slice(0, 12)}`;
    await servirComCache(reply, chave, () => renderCartinhaPng(dados));
  });

  app.get('/perfil/cartinha.png', async (req, reply) => {
    const { org } = req.query as { org?: string };
    const orgId = await orgComum(req, req.usuario.id, org);
    const dados = await montarDados(req.usuario.id, orgId);
    const chave = `${req.usuario.id}-${createHash('sha1')
      .update(JSON.stringify([VERSAO_LAYOUT, dados.fotoUrl, dados.fotoRecortada, dados.estrelas, dados.posicao, dados.pePreferido, dados.desempenho]))
      .digest('hex')
      .slice(0, 12)}`;
    await servirComCache(reply, chave, () => renderCartinhaPng(dados));
  });
};
