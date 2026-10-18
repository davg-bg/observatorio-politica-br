/**
 * Cliente Drizzle para o Postgres do Supabase.
 *
 * Padrão: singleton por processo. Em dev, o Next recarrega módulos e cria
 * múltiplos clients — mitigamos usando `globalThis` como cache.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '@/lib/env';
import * as schema from './schema';

type Database = PostgresJsDatabase<typeof schema>;

declare global {
  var __drizzle_db: Database | undefined;
  var __postgres_sql: ReturnType<typeof postgres> | undefined;
}

export function getDb(): Database | null {
  if (!serverEnv.DATABASE_URL) return null;

  if (globalThis.__drizzle_db) return globalThis.__drizzle_db;

  // `prepare: false` é recomendado para pooler do Supabase (modo transaction).
  const client = postgres(serverEnv.DATABASE_URL, {
    prepare: false,
    max: 5,
  });
  const db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__drizzle_db = db;
    globalThis.__postgres_sql = client;
  }

  return db;
}

export { schema };
