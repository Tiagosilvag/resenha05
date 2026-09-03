import type { FastifyPluginAsync } from 'fastify';
import {
  atualizarPerfilSchema,
  perfilExtraSchema,
  progressoPerfilExtra,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { salvarAvatar, extPara } from '../../lib/uploads.js';

const TAM_MAX = 6 * 1024 * 1024;

export const rotasPerfil: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autenticar);

  app.patch('/perfil', async (req) => {
    const d = validar(atualizarPerfilSchema, req.body);
    await db
      .updateTable('profiles')
      .set({
        ...(d.nome !== undefined ? { nome: d.nome } : {}),
        ...(d.timeCoracao !== undefined ? { time_coracao: d.timeCoracao } : {}),
        ...(d.fotoUrl !== undefined ? { foto_url: d.fotoUrl } : {}),
      })
      .where('id', '=', req.usuario.id)
      .execute();
    return { ok: true };
  });

  // LGPD — exclusão de conta e dados. As FKs on delete cascade cuidam do resto.
  app.delete('/perfil', async (req, reply) => {
    const donoDe = await db
      .selectFrom('organizacoes')
      .select('id')
      .where('dono_id', '=', req.usuario.id)
      .executeTakeFirst();
    if (donoDe) {
      throw erro.conflito(
        'Transfira ou encerre sua organização antes de excluir a conta.',
      );
    }
    await db.deleteFrom('profiles').where('id', '=', req.usuario.id).execute();
    reply.code(204);
  });

  app.get('/perfil/extra', async (req) => {
    const extra = await db
      .selectFrom('perfil_extra')
      .selectAll()
      .where('profile_id', '=', req.usuario.id)
      .executeTakeFirst();

    const camelForm = extra
      ? {
          dataNascimento: extra.data_nascimento,
          email: extra.email,
          cidade: extra.cidade,
          posicao: extra.posicao,
          pePreferido: extra.pe_preferido,
          tamanhoCamisa: extra.tamanho_camisa,
          aceiteMarketing: extra.aceite_marketing,
        }
      : null;
    return { extra: camelForm, progresso: progressoPerfilExtra(camelForm) };
  });

  app.put('/perfil/extra', async (req) => {
    const d = validar(perfilExtraSchema, req.body);
    const linha = {
      data_nascimento: d.dataNascimento ?? null,
      email: d.email ?? null,
      cidade: d.cidade ?? null,
      posicao: d.posicao ?? null,
      pe_preferido: d.pePreferido ?? null,
      tamanho_camisa: d.tamanhoCamisa ?? null,
      aceite_marketing: d.aceiteMarketing ?? false,
    };
    await db
      .insertInto('perfil_extra')
      .values({ profile_id: req.usuario.id, ...linha })
      .onConflict((oc) => oc.column('profile_id').doUpdateSet(linha))
      .execute();
    return { ok: true };
  });

  // Fase 1 — upload de foto: multipart direto, gravado num volume do servidor.
  app.post('/perfil/foto', async (req) => {
    const arquivo = await req.file({ limits: { fileSize: TAM_MAX } });
    if (!arquivo) throw erro.invalido('Envie uma imagem no campo "foto".');

    const ext = extPara(arquivo.mimetype);
    if (!ext) throw erro.invalido('Formato inválido. Use JPEG, PNG ou WebP.');

    let dados: Buffer;
    try {
      dados = await arquivo.toBuffer();
    } catch {
      throw erro.invalido('Imagem muito grande (máx. 6 MB).');
    }
    if (arquivo.file.truncated) throw erro.invalido('Imagem muito grande (máx. 6 MB).');

    const fotoUrl = await salvarAvatar(req.usuario.id, dados, ext);
    await db
      .updateTable('profiles')
      .set({ foto_url: fotoUrl })
      .where('id', '=', req.usuario.id)
      .execute();
    return { fotoUrl };
  });
};
