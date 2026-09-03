import { z } from 'zod';

// Compose passa muitas variáveis opcionais como string vazia ("${X:-}").
// Trata "" como "não definida" para os defaults/optional funcionarem.
const raw = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória.'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa de pelo menos 16 caracteres.'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET precisa de pelo menos 16 caracteres.'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DIAS: z.coerce.number().default(30),

  // 32 bytes em base64 — chave do AES-256-GCM do token de Mercado Pago (Fase 6+).
  RESENHA05_ENC_KEY: z.string().optional(),

  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  // Pasta onde as fotos de perfil são gravadas (volume no compose).
  UPLOADS_DIR: z.string().default('uploads'),

  // Serviço interno de recorte de fundo (container `bgremove` no compose).
  // Vazio = recurso desligado: a foto é salva sem recorte.
  BGREMOVE_URL: z.string().url().optional(),

  N8N_PAGAMENTO_WEBHOOK_URL: z.string().url().optional(),
  MERCADOPAGO_PLATAFORMA_TOKEN: z.string().optional(),

  // Token compartilhado para o n8n chamar endpoints internos. Se vazio,
  // esses endpoints exigem login de admin.
  SERVICE_TOKEN: z.string().min(16).optional(),
});

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error(
    'Configuração inválida:\n',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;

// RESENHA05_ENC_KEY: só avisa se a forma estiver errada — o recurso de
// pagamento (Fase 6) valida de novo na hora de usar.
if (env.RESENHA05_ENC_KEY && Buffer.from(env.RESENHA05_ENC_KEY, 'base64').length !== 32) {
  console.warn(
    '[aviso] RESENHA05_ENC_KEY não decodifica para 32 bytes — a cifra do token de Mercado Pago vai falhar até corrigir (openssl rand -base64 32).',
  );
}

