import { env } from '../env.js';

const TIMEOUT_MS = 25_000;

/**
 * Manda a foto pro serviço interno de recorte e devolve o PNG com alfa.
 * Retorna null se o recurso está desligado (sem BGREMOVE_URL) ou se algo
 * falhou — o chamador então salva a foto original sem recorte.
 */
export async function recortarFundo(
  dados: Buffer,
  mime: string,
): Promise<Buffer | null> {
  if (!env.BGREMOVE_URL) return null;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('file', new Blob([dados], { type: mime }), 'foto');

    const resp = await fetch(`${env.BGREMOVE_URL}/remove`, {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    });
    if (!resp.ok) return null;

    const buf = Buffer.from(await resp.arrayBuffer());
    // sanidade: PNG começa com \x89PNG
    if (buf.length < 100 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
