import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';

export const UPLOADS_DIR = resolve(env.UPLOADS_DIR);
const PREFIXO_PUBLICO = '/api/uploads';

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extPara(mime: string): string | null {
  return EXT_POR_MIME[mime] ?? null;
}

/**
 * Grava o avatar em <UPLOADS_DIR>/avatars/<profileId>/<uuid>.<ext>,
 * remove versões antigas do mesmo jogador e devolve a URL pública
 * (servida pelo @fastify/static em /api/uploads).
 */
export async function salvarAvatar(
  profileId: string,
  dados: Buffer,
  ext: string,
): Promise<string> {
  const pasta = join(UPLOADS_DIR, 'avatars', profileId);
  await mkdir(pasta, { recursive: true });

  // apaga as fotos anteriores desse jogador
  try {
    for (const f of await readdir(pasta)) {
      await rm(join(pasta, f), { force: true });
    }
  } catch {
    /* pasta vazia */
  }

  const nome = `${randomUUID()}.${ext}`;
  await writeFile(join(pasta, nome), dados);
  return `${PREFIXO_PUBLICO}/avatars/${profileId}/${nome}`;
}

export async function garantirPastaUploads(): Promise<void> {
  await mkdir(join(UPLOADS_DIR, 'avatars'), { recursive: true }).catch(() => {});
}
