import { z } from 'zod';
import { normalizarTelefone, telefoneCelularValido } from '../telefone.js';

export const PAPEIS = ['jogador', 'admin', 'admin_principal'] as const;
export type Papel = (typeof PAPEIS)[number];

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
  telefone: z
    .string()
    .trim()
    .transform(normalizarTelefone)
    .refine(telefoneCelularValido, {
      message: 'Digite o número completo com DDD: (XX) XXXXX-XXXX.',
    }),
});

export const MAX_ADMINS = 5;
