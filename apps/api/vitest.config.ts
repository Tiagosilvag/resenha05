import { defineConfig } from 'vitest/config';

// env.ts derruba o processo se faltar variável obrigatória; os testes importam
// módulos que o carregam, então damos valores de mentira (sem conexão real —
// o pool do pg só conecta na primeira query).
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgres://teste:teste@localhost:5432/teste',
      JWT_SECRET: 'segredo-de-teste-com-16+',
      JWT_REFRESH_SECRET: 'refresh-de-teste-com-16+',
      PLATAFORMA_DEV_TELEFONE: '11900000000',
      MERCADOPAGO_WEBHOOK_SECRET: 'segredo-webhook-de-teste',
    },
  },
});
