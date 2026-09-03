#!/usr/bin/env node
// =============================================================================
// Runner de migrations — roda no deploy (e localmente).
//
//   node db/migrate.mjs            aplica as migrations pendentes
//   node db/migrate.mjs --status   só lista o que está aplicado / pendente
//
// Idempotente: cada arquivo db/migrations/NNNN_*.sql roda uma única vez, dentro
// de uma transação, e é registrado em _migrations. Um advisory lock impede que
// dois deploys simultâneos apliquem a mesma migration.
// =============================================================================
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');
const LOCK_KEY = 727270501; // arbitrário, fixo para o projeto
const statusOnly = process.argv.includes('--status');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERRO: DATABASE_URL não definida.');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

// Espera o Postgres aceitar conexão (o container do banco pode subir logo
// depois da API no docker-compose).
{
  const MAX = 20;
  for (let tentativa = 1; ; tentativa++) {
    try {
      await client.connect();
      break;
    } catch (err) {
      if (tentativa >= MAX) {
        console.error(`Não conectou ao banco após ${MAX} tentativas: ${err.message}`);
        process.exit(1);
      }
      process.stdout.write(`Banco indisponível (tentativa ${tentativa}/${MAX})...\n`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

try {
  await client.query(`
    create table if not exists _migrations (
      nome        text primary key,
      aplicada_em timestamptz not null default now()
    )
  `);

  const aplicadas = new Set(
    (await client.query('select nome from _migrations')).rows.map((r) => r.nome),
  );

  const arquivos = (await readdir(migrationsDir))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();

  const pendentes = arquivos.filter((f) => !aplicadas.has(f));

  if (statusOnly) {
    for (const f of arquivos) {
      console.log(`${aplicadas.has(f) ? '[x]' : '[ ]'} ${f}`);
    }
    console.log(`\n${pendentes.length} pendente(s).`);
    process.exit(0);
  }

  if (pendentes.length === 0) {
    console.log('Nada pendente.');
    process.exit(0);
  }

  await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);

  // Recarrega depois do lock — outro deploy pode ter aplicado no intervalo.
  const jaAplicadas = new Set(
    (await client.query('select nome from _migrations')).rows.map((r) => r.nome),
  );

  let n = 0;
  for (const arq of arquivos) {
    if (jaAplicadas.has(arq)) continue;
    const sql = await readFile(path.join(migrationsDir, arq), 'utf8');
    process.stdout.write(`→ ${arq} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (nome) values ($1)', [arq]);
      await client.query('commit');
      console.log('ok');
      n++;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.log('FALHOU');
      console.error(`\n${arq}: ${err.message}\n`);
      process.exit(1);
    }
  }

  await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
  console.log(`${n} migration(s) aplicada(s).`);
} finally {
  await client.end();
}
