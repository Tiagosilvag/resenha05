import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { env } from '../env.js';
import type { Database } from './schema.js';

// `date` (OID 1082): devolve como string 'YYYY-MM-DD' em vez de Date, para o
// front montar a data sem fuso atrapalhando.
pg.types.setTypeParser(1082, (v) => v);
// `numeric` (OID 1700): já vem como string por padrão — mantido.

// numeric -> string por padrão no node-postgres; deixamos assim e convertemos
// nos pontos que precisam (valores de pelada). timestamptz -> Date.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function pingDb(): Promise<void> {
  await db.selectFrom('profiles').select(db.fn.countAll().as('n')).executeTakeFirst();
}
