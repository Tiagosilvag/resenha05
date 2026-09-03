import { tokens, ApiError } from './api';

export type EtapaFoto = 'enviando';

/** Envia a foto de perfil (multipart) para a API e devolve a URL pública. */
export async function enviarFoto(
  arquivo: File,
  onEtapa?: (e: EtapaFoto) => void,
): Promise<{ fotoUrl: string; recortada: boolean }> {
  onEtapa?.('enviando');
  const fd = new FormData();
  fd.append('recortada', 'false');
  fd.append('foto', arquivo);

  const headers = new Headers();
  if (tokens.access) headers.set('authorization', `Bearer ${tokens.access}`);

  const resp = await fetch('/api/perfil/foto', { method: 'POST', body: fd, headers });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new ApiError(resp.status, (corpo as { erro?: string }).erro ?? 'Falha ao enviar a foto.');
  }
  return { fotoUrl: (corpo as { fotoUrl: string }).fotoUrl, recortada: false };
}
