import { tokens, ApiError } from './api';

export type EtapaFoto = 'preparando' | 'enviando';

const LADO_MAX = 1200; // px — avatar não precisa de mais que isso
const QUALIDADE = 0.85;

/**
 * Reduz a imagem no próprio navegador antes de subir:
 * - resolve o limite de tamanho (fotos de celular têm 3–8 MB)
 * - reencoda para JPEG, então some com HEIC do iPhone e com o EXIF
 * Se o navegador não conseguir decodificar, sobe o arquivo original.
 */
async function comprimir(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith('image/') || typeof createImageBitmap !== 'function') {
    return arquivo;
  }
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', QUALIDADE),
    );
    if (!blob) return arquivo;
    // se por algum motivo ficou maior que o original, usa o original
    return blob.size < arquivo.size ? blob : arquivo;
  } catch {
    return arquivo;
  }
}

/** Envia a foto de perfil (multipart) para a API e devolve a URL pública. */
export async function enviarFoto(
  arquivo: File,
  onEtapa?: (e: EtapaFoto) => void,
): Promise<{ fotoUrl: string; recortada: boolean }> {
  onEtapa?.('preparando');
  const imagem = await comprimir(arquivo);
  const nome = imagem === arquivo ? arquivo.name : 'foto.jpg';

  onEtapa?.('enviando');
  const fd = new FormData();
  fd.append('recortada', 'false');
  fd.append('foto', imagem, nome);

  const headers = new Headers();
  if (tokens.access) headers.set('authorization', `Bearer ${tokens.access}`);

  let resp: Response;
  try {
    resp = await fetch('/api/perfil/foto', { method: 'POST', body: fd, headers });
  } catch {
    throw new ApiError(0, 'Sem conexão. Verifique a internet e tente de novo.');
  }

  if (resp.status === 413) {
    throw new ApiError(413, 'A foto ficou grande demais. Tente outra imagem.');
  }
  const corpo = await resp.json().catch(() => ({}) as Record<string, unknown>);
  if (!resp.ok) {
    const msg = (corpo as { erro?: string; message?: string }).erro
      ?? (corpo as { message?: string }).message
      ?? 'Falha ao enviar a foto.';
    throw new ApiError(resp.status, msg);
  }
  return { fotoUrl: (corpo as { fotoUrl: string }).fotoUrl, recortada: false };
}
