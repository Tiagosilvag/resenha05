import { z } from 'zod';

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (HH:MM).');
const dinheiro = z.number().nonnegative().max(100000).nullable().optional();

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

export const criarConfiguracaoSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  diaSemana: z.number().int().min(0).max(6),
  horarioJogo: hora,
  horarioLista: hora,
  local: z.string().trim().max(200).nullable().optional(),
  valorPadrao: dinheiro,
  ativo: z.boolean().optional(),
});
export type CriarConfiguracaoInput = z.infer<typeof criarConfiguracaoSchema>;

export const criarPeladaSchema = z.object({
  configId: z.string().uuid().nullable().optional(),
  tipo: z.enum(['pelada', 'torneio', 'campeonato']).optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: hora.nullable().optional(),
  local: z.string().trim().max(200).nullable().optional(),
  valor: dinheiro,
});

export const criarPeladaDaConfigSchema = z.object({
  configId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const confirmarPresencaSchema = z.object({
  status: z.enum(['confirmado', 'desistiu']).optional(),
});

/** Admin marca/desmarca quem já pagou a pelada. */
export const marcarPagamentoSchema = z.object({
  profileId: z.string().uuid(),
  pago: z.boolean(),
});

export const mudarStatusPeladaSchema = z.object({
  status: z.enum(['aberta', 'fechada', 'realizada', 'cancelada']),
});

export const sortearSchema = z.object({
  nTimes: z.number().int().min(2).max(32),
  seed: z.number().int().optional(),
});
export type SortearInput = z.infer<typeof sortearSchema>;
