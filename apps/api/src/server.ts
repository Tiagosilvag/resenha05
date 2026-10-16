import { construirApp } from './app.js';
import { env } from './env.js';
import { pool } from './db/index.js';
import { expirarLiberacoesManuais } from './lib/liberacao-manual.js';

const app = await construirApp();

try {
  await app.listen({ host: '0.0.0.0', port: env.PORT });
  app.log.info(`Resenha05 API ouvindo em 0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Liberações manuais da mensalidade que já passaram do mês voltam a pendente.
async function varrerLiberacoes() {
  try {
    const n = await expirarLiberacoesManuais();
    if (n > 0) app.log.info(`${n} organização(ões) com liberação manual vencida voltaram a pendente.`);
  } catch (err) {
    app.log.error(err, 'Falha ao varrer liberações manuais vencidas');
  }
}
void varrerLiberacoes();
const varredura = setInterval(varrerLiberacoes, 60 * 60 * 1000);
varredura.unref();

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, async () => {
    app.log.info(`${sinal} recebido, encerrando...`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
