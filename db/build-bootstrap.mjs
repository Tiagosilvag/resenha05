#!/usr/bin/env node
// =============================================================================
// Gera db/bootstrap.sql — UM script psql, do zero (role + banco) até o schema
// completo, com as migrations já marcadas como aplicadas.
//
//   node db/build-bootstrap.mjs
//
// Uso do arquivo gerado (rodar UMA vez, conectado ao banco `postgres` como
// superusuário):
//
//   psql -h HOST -U postgres -f db/bootstrap.sql
//
// Antes de rodar, edite a linha `\set app_password` no topo do bootstrap.sql.
// Depois disso, o deploy usa só `node db/migrate.mjs` para as migrations novas.
// =============================================================================
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');

const arquivos = (await readdir(migrationsDir))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

let out = `-- =============================================================================
-- bootstrap.sql — GERADO por db/build-bootstrap.mjs. NÃO edite à mão.
-- =============================================================================
-- Do zero ao schema completo, num único psql. Rode UMA vez como superusuário,
-- conectado ao banco "postgres":
--
--   psql -h HOST -U postgres -f db/bootstrap.sql
--
-- >>> EDITE a senha na linha abaixo antes de rodar <<<
\\set app_password 'TROQUE_ESTA_SENHA_FORTE'
-- =============================================================================
\\set ON_ERROR_STOP on

\\echo '== role resenha05_app =='
-- \\gexec: monta o CREATE ROLE só se o papel ainda não existe. A senha vem da
-- variável psql \\set acima (interpolada aqui, fora de qualquer aspas).
SELECT format('CREATE ROLE resenha05_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'resenha05_app')\\gexec

\\echo '== database resenha05 =='
SELECT 'CREATE DATABASE resenha05 OWNER resenha05_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'resenha05')\\gexec

\\connect resenha05
ALTER SCHEMA public OWNER TO resenha05_app;
GRANT ALL ON SCHEMA public TO resenha05_app;
SET ROLE resenha05_app;

CREATE TABLE IF NOT EXISTS _migrations (
  nome        text PRIMARY KEY,
  aplicada_em timestamptz NOT NULL DEFAULT now()
);

`;

for (const arq of arquivos) {
  const body = (await readFile(path.join(migrationsDir, arq), 'utf8')).trim();
  out += `\n-- ============================ ${arq} ============================\n`;
  out += `\\echo '== ${arq} =='\n`;
  out += 'BEGIN;\n';
  out += body + '\n';
  out += `INSERT INTO _migrations (nome) VALUES ('${arq}') ON CONFLICT DO NOTHING;\n`;
  out += 'COMMIT;\n';
}

out += `\n\\echo ''\n\\echo 'Pronto. Schema resenha05 criado. Deploys seguintes: node db/migrate.mjs'\n`;

await writeFile(path.join(here, 'bootstrap.sql'), out);
console.log(`db/bootstrap.sql gerado (${arquivos.length} migration(s)).`);
