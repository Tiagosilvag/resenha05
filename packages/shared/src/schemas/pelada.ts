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

/** Admin coloca outro jogador na lista da pelada. */
export const adicionarPresencaSchema = z.object({
  profileId: z.string().uuid(),
  status: z.enum(['confirmado', 'pago']).optional(),
});

/** Admin marca/desmarca quem já pagou a pelada. */
export const marcarPagamentoSchema = z.object({
  profileId: z.string().uuid(),
  pago: z.boolean(),
});

export const mudarStatusPeladaSchema = z.object({
  status: z.enum(['aberta', 'fechada', 'realizada', 'cancelada']),
});

/**
 * Ou `nTimes` (divide todo mundo em N times) ou `jogadoresPorTime` (times de
 * exatamente N jogadores, mais um time com quem sobrar) — um dos dois.
 */
export const sortearSchema = z
  .object({
    nTimes: z.number().int().min(2).max(32).optional(),
    jogadoresPorTime: z.number().int().min(1).max(100).optional(),
    seed: z.number().int().optional(),
  })
  .refine((v) => (v.nTimes === undefined) !== (v.jogadoresPorTime === undefined), {
    message: 'Informe o número de times ou o de jogadores por time.',
  });
export type SortearInput = z.infer<typeof sortearSchema>;

/** Admin move um jogador de um time para outro do sorteio (ainda em rascunho). */
export const moverJogadorSorteioSchema = z.object({
  profileId: z.string().uuid(),
  timeNumero: z.number().int().min(1).max(32),
});

/** Regras de todas as partidas de uma pelada; null/ausente = sem limite. */
export const regrasPartidaSchema = z.object({
  duracaoMin: z.number().int().min(1, 'Mínimo de 1 minuto.').max(180).nullable(),
  golsLimite: z.number().int().min(1, 'Mínimo de 1 gol.').max(99).nullable(),
});
export type RegrasPartidaInput = z.infer<typeof regrasPartidaSchema>;

export const criarPartidaSchema = z
  .object({ timeAId: z.string().uuid(), timeBId: z.string().uuid() })
  .refine((v) => v.timeAId !== v.timeBId, { message: 'Escolha dois times diferentes.' });

export const golPartidaSchema = z.object({
  timeId: z.string().uuid(),
  profileId: z.string().uuid(),
});

export const encerrarPartidaSchema = z.object({
  observacao: z.string().trim().max(200).optional(),
});

/** Time que perdeu (a redistribuição parte dele); null = empate/ninguém sai. */
export const concluirPartidaSchema = z.object({
  perdedorTimeId: z.string().uuid().nullable(),
});

/** Troca durante a partida; `voltaAJogar` false = quem saiu não joga mais hoje (lesão). */
export const substituirJogadorSchema = z
  .object({
    saiProfileId: z.string().uuid(),
    entraProfileId: z.string().uuid(),
    voltaAJogar: z.boolean().default(true),
  })
  .refine((v) => v.saiProfileId !== v.entraProfileId, { message: 'Escolha dois jogadores diferentes.' });
