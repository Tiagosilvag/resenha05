import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DIAS: z.coerce.number().default(30),

  // 32 bytes em base64 — chave do AES-256-GCM para o token de Mercado Pago.
  RESENHA05_ENC_KEY: z
    .string()
    .optional()
    .refine((v) => !v || Buffer.from(v, 'base64').length === 32, {
      message: 'RESENHA05_ENC_KEY deve ser 32 bytes em base64 (openssl rand -base64 32).',
    }),

  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('resenha05-avatars'),
  R2_PUBLIC_URL: z.string().url().optional(),

  N8N_PAGAMENTO_WEBHOOK_URL: z.string().url().optional(),
  MERCADOPAGO_PLATAFORMA_TOKEN: z.string().optional(),

  // Token compartilhado para o n8n chamar endpoints internos (ex.: gerar a
  // pelada da semana). Se vazio, esses endpoints exigem login de admin.
  SERVICE_TOKEN: z.string().min(16).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    'Configuração inválida:\n',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
export const r2Configurado = Boolean(
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_PUBLIC_URL,
);
