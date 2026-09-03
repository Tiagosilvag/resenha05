import type { ZodType } from 'zod';
import { AppError } from './erros.js';

/** Valida `dado` contra o schema; lança AppError 422 com a primeira mensagem. */
export function validar<T>(schema: ZodType<T>, dado: unknown): T {
  const r = schema.safeParse(dado);
  if (!r.success) {
    const issue = r.error.issues[0];
    const campo = issue?.path.join('.') ?? '';
    const msg = issue?.message ?? 'Dados inválidos.';
    throw new AppError(422, campo ? `${campo}: ${msg}` : msg, 'validacao');
  }
  return r.data;
}
