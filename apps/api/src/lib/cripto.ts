import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '../env.js';
import { erro } from './erros.js';

/**
 * Cifra simétrica do Access Token de Mercado Pago das organizações.
 * AES-256-GCM. A chave vem de RESENHA05_ENC_KEY (32 bytes base64).
 * Guarda-se `cipher` (com a tag GCM anexada) e `nonce` separados no banco.
 */

/** A chave do servidor está ausente ou com tamanho errado (nunca carrega o valor dela). */
export class ChaveCriptoInvalida extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChaveCriptoInvalida';
  }
}

/** Confere a chave e diz exatamente o que está errado, sem expor o valor. */
export function validarChave(base64: string | undefined): Buffer {
  if (!base64) {
    throw new ChaveCriptoInvalida(
      'RESENHA05_ENC_KEY não está configurada no servidor (ausente ou vazia no container).',
    );
  }
  const chave = Buffer.from(base64, 'base64');
  if (chave.length !== 32) {
    throw new ChaveCriptoInvalida(
      `RESENHA05_ENC_KEY inválida: decodifica para ${chave.length} bytes, o esperado são 32 (gere com: openssl rand -base64 32).`,
    );
  }
  return chave;
}

function chave(): Buffer {
  return validarChave(env.RESENHA05_ENC_KEY);
}

/** Cifra para gravar no banco; se a chave do servidor estiver errada, devolve 422 com o motivo. */
export function cifrarTokenOuErro(textoPuro: string): { cipher: Buffer; nonce: Buffer } {
  try {
    return cifrarToken(textoPuro);
  } catch (e) {
    if (e instanceof ChaveCriptoInvalida) throw erro.invalido(e.message);
    throw e;
  }
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
