import { tokens, ApiError } from './api';

export class FotoIndisponivel extends Error {}

/**
 * Envia a foto de perfil (multipart) para a API, que grava no servidor e
 * atualiza o perfil. Devolve a URL pública da imagem.
 */
export async function enviarFoto(arquivo: File): Promise<string> {
  const fd = new FormData();
  fd.append('foto', arquivo);

  const headers = new Headers();
  if (tokens.access) headers.set('authorization', `Bearer ${tokens.access}`);

  const resp = await fetch('/api/perfil/foto', { method: 'POST', body: fd, headers });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new ApiError(resp.status, (corpo as { erro?: string }).erro ?? 'Falha ao enviar a foto.');
  }
  return (corpo as { fotoUrl: string }).fotoUrl;
}
