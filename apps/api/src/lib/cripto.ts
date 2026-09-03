import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '../env.js';

/**
 * Cifra simétrica do Access Token de Mercado Pago das organizações.
 * AES-256-GCM. A chave vem de RESENHA05_ENC_KEY (32 bytes base64).
 * Guarda-se `cipher` (com a tag GCM anexada) e `nonce` separados no banco.
 */

function chave(): Buffer {
  if (!env.RESENHA05_ENC_KEY) {
    throw new Error('RESENHA05_ENC_KEY não configurada — não é possível cifrar o token.');
  }
  return Buffer.from(env.RESENHA05_ENC_KEY, 'base64');
}

export function cifrarToken(textoPuro: string): { cipher: Buffer; nonce: Buffer } {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), nonce);
  const enc = Buffer.concat([c.update(textoPuro, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return { cipher: Buffer.concat([enc, tag]), nonce };
}

export function decifrarToken(cipher: Buffer, nonce: Buffer): string {
  const tag = cipher.subarray(cipher.length - 16);
  const dados = cipher.subarray(0, cipher.length - 16);
  const d = createDecipheriv('aes-256-gcm', chave(), nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

/** Só para nunca logar o token inteiro. */
export function mascararToken(token: string): string {
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

export function sha256(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
