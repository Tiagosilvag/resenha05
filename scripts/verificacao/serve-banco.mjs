// Postgres de teste em memória (PGlite) na porta 55432, já com todas as migrations de db/migrations.
// Uso: node scripts/verificacao/serve-banco.mjs   (a cada reinício o banco volta vazio)
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(aqui, '..', '..', 'db', 'migrations');

const db = new PGlite();
const arquivos = (await readdir(dir)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
for (const f of arquivos) {
  await db.exec(await readFile(path.join(dir, f), 'utf8'));
  console.log('applied', f);
}
const servidor = new PGLiteSocketServer({ db, port: 55432, host: '127.0.0.1', maxConnections: 10 });
await servidor.start();
console.log('pglite-socket listening on 127.0.0.1:55432');
