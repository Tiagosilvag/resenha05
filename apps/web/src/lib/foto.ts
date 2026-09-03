import { api, ApiError } from './api';

interface UrlUpload {
  uploadUrl: string;
  publicUrl: string;
  expiraEmSegundos: number;
}

export class FotoIndisponivel extends Error {}

/**
 * Sobe a foto para o R2 via URL pré-assinada e devolve a URL pública.
 * Lança FotoIndisponivel se o armazenamento ainda não estiver configurado.
 */
export async function enviarFoto(arquivo: File): Promise<string> {
  let dados: UrlUpload;
  try {
    dados = await api<UrlUpload>('/perfil/foto/upload-url', {
      method: 'POST',
      json: { contentType: arquivo.type },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) throw new FotoIndisponivel(e.message);
    throw e;
  }

  const put = await fetch(dados.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': arquivo.type },
    body: arquivo,
  });
  if (!put.ok) throw new Error('Falha ao enviar a foto. Tente outra imagem.');
  return dados.publicUrl;
}
