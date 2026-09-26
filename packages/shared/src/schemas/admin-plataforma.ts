import { z } from 'zod';

export const STATUS_ASSINATURA = ['trial', 'ativa', 'inadimplente', 'cancelada'] as const;
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number];

export const configurarMensalidadeSchema = z.object({
  valorCentavos: z.number().int().min(100, 'Valor mínimo de R$ 1,00.').max(1_000_000),
});

export const conectarMercadoPagoGeralSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(20, 'O Access Token de produção parece curto demais.')
    .max(400),
});

export const cadastrarAdminPlataformaSchema = z.object({
  profileId: z.string().uuid(),
});
