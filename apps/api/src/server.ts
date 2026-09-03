import { construirApp } from './app.js';
import { env } from './env.js';
import { pool } from './db/index.js';

const app = await construirApp();

try {
  await app.listen({ host: '0.0.0.0', port: env.PORT });
  app.log.info(`Resenha05 API ouvindo em 0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, async () => {
    app.log.info(`${sinal} recebido, encerrando...`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
