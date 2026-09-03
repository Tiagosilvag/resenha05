import { z } from 'zod';

export const atualizarPerfilSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  timeCoracao: z.string().trim().max(60).nullable().optional(),
  fotoUrl: z.string().url().max(500).nullable().optional(),
});
export type AtualizarPerfilInput = z.infer<typeof atualizarPerfilSchema>;

export const perfilExtraSchema = z.object({
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  cidade: z.string().trim().max(80).nullable().optional(),
  posicao: z
    .enum(['goleiro', 'zagueiro', 'lateral', 'meio', 'atacante'])
    .nullable()
    .optional(),
  pePreferido: z.enum(['direito', 'esquerdo', 'ambidestro']).nullable().optional(),
  tamanhoCamisa: z.enum(['PP', 'P', 'M', 'G', 'GG', 'XG']).nullable().optional(),
  aceiteMarketing: z.boolean().optional(),
});
export type PerfilExtraInput = z.infer<typeof perfilExtraSchema>;

/** Campos que contam para a barra de progresso do "Complete seu cadastro". */
export const CAMPOS_PERFIL_EXTRA = [
  'dataNascimento',
  'email',
  'cidade',
  'posicao',
  'pePreferido',
  'tamanhoCamisa',
] as const;

export function progressoPerfilExtra(
  extra: Partial<Record<(typeof CAMPOS_PERFIL_EXTRA)[number], unknown>> | null,
): number {
  if (!extra) return 0;
  const preenchidos = CAMPOS_PERFIL_EXTRA.filter(
    (c) => extra[c] !== null && extra[c] !== undefined && extra[c] !== '',
  ).length;
  return Math.round((preenchidos / CAMPOS_PERFIL_EXTRA.length) * 100);
}

export const solicitarCodigoSchema = z.object({});
export const confirmarCodigoSchema = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos.'),
});
