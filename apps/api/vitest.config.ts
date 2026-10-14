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
      // 32 bytes (0x01) em base64 — só pra testar a cifra de ida e volta.
      RESENHA05_ENC_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
    },
  },
});
