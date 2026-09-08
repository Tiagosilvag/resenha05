import { z } from 'zod';

export const FORMATOS_TORNEIO = ['grupos', 'mata_mata', 'pontos_corridos'] as const;
export const TIPOS_EVENTO = [
  'gol',
  'gol_contra',
  'assistencia',
  'cartao_amarelo',
  'cartao_vermelho',
] as const;

export const criarTorneioSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  times: z
    .array(z.object({ nome: z.string().trim().min(1).max(60), grupo: z.string().trim().max(20).optional() }))
    .min(2, 'Um torneio precisa de pelo menos 2 times.')
    .max(64),
});
export type CriarTorneioInput = z.infer<typeof criarTorneioSchema>;

/**
 * Fase do torneio: cada uma tem seu próprio formato — um torneio pode ter,
 * por exemplo, uma fase de grupos (pontos corridos por grupo) seguida de um
 * mata-mata, em vez de um formato único preso ao torneio inteiro.
 */
export const criarFaseSchema = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à fase.').max(60),
  formato: z.enum(FORMATOS_TORNEIO),
});
export type CriarFaseInput = z.infer<typeof criarFaseSchema>;

export const criarJogoSchema = z.object({
  faseId: z.string().uuid(),
  timeAId: z.string().uuid().nullable().optional(),
  timeBId: z.string().uuid().nullable().optional(),
  timeANome: z.string().trim().max(60).optional(),
  timeBNome: z.string().trim().max(60).optional(),
  data: z.string().datetime().optional(),
});

export const registrarPlacarSchema = z.object({
  placarA: z.number().int().min(0).max(99),
  placarB: z.number().int().min(0).max(99),
  status: z.enum(['agendado', 'em_andamento', 'encerrado']).optional(),
});

export const eventoSumulaSchema = z.object({
  profileId: z.string().uuid(),
  timeId: z.string().uuid().nullable().optional(),
  tipo: z.enum(TIPOS_EVENTO),
  minuto: z.number().int().min(0).max(200).nullable().optional(),
});

export interface LinhaClassificacao {
  timeId: string | null;
  nome: string;
  grupo: string | null;
  pontos: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golsPro: number;
  golsContra: number;
  saldo: number;
}
