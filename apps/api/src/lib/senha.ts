import { hash, verify, Algorithm } from '@node-rs/argon2';

// @node-rs/argon2: prebuilds nativos (inclui musl/alpine), sem compilação.
const OPCOES = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 MiB (recomendação OWASP)
  timeCost: 2,
  parallelism: 1,
};

export function hashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

export async function conferirSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha);
  } catch {
    return false;
  }
}
