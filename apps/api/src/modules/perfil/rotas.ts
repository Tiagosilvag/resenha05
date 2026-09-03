import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  atualizarPerfilSchema,
  perfilExtraSchema,
  progressoPerfilExtra,
} from '@resenha05/shared';
import { db } from '../../db/index.js';
import { validar } from '../../lib/validar.js';
import { erro } from '../../lib/erros.js';
import { gerarUrlUpload, r2Pronto } from '../../lib/r2.js';

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

  // Fase 1 — upload de foto: a API devolve uma URL PUT pré-assinada do R2.
  app.post('/perfil/foto/upload-url', async (req) => {
    if (!r2Pronto()) throw erro.invalido('Armazenamento de fotos não configurado.');
    const body = (req.body ?? {}) as { contentType?: string };
    const tipo = body.contentType ?? 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)$/.test(tipo)) {
      throw erro.invalido('Envie uma imagem JPEG, PNG ou WebP.');
    }
    const ext = tipo.split('/')[1]!.replace('jpeg', 'jpg');
    const chave = `avatars/${req.usuario.id}/${randomUUID()}.${ext}`;
    return gerarUrlUpload(chave, tipo);
  });
};
