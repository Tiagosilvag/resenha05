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

/**
 * O Mercado Pago só cria a assinatura se o e-mail do pagador for de uma conta
 * dele do mesmo tipo (teste ou real) que a conta vendedora — então o dono
 * informa o e-mail da conta que vai pagar no checkout.
 */
export const iniciarCheckoutSchema = z.object({
  payerEmail: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(254),
});

export const configurarWebhookSecretSchema = z.object({
  webhookSecret: z.string().trim().min(10, 'Segredo muito curto.').max(200),
});
