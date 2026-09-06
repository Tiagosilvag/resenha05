import { z } from 'zod';

export const PAPEIS = ['jogador', 'admin', 'admin_principal'] as const;
export type Papel = (typeof PAPEIS)[number];

/** Código curto da organização: 6 caracteres, sem O/0 e I/1. */
export const codigoOrganizacao = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, 'O código tem 6 letras e números (sem O, 0, I ou 1).');

export const entrarPorCodigoSchema = z.object({ codigo: codigoOrganizacao });

export const criarOrganizacaoSchema = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à organização.').max(120),
});

export const conectarMercadoPagoSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(20, 'O Access Token de produção parece curto demais.')
    .max(400),
});

export const promoverMembroSchema = z.object({
  profileId: z.string().uuid(),
  papel: z.enum(['jogador', 'admin']),
});

export const ajustarEstrelasSchema = z.object({
  profileId: z.string().uuid(),
  estrelas: z.number().int().min(1).max(5),
});

export const adicionarMembroSchema = z.object({
  profileId: z.string().uuid(),
});

export const removerMembroSchema = z.object({
  profileId: z.string().uuid(),
});

export const MAX_ADMINS = 5;
