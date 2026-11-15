import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// MIGRATION 038: saved search filter templates and search history.

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  const s = quoteIdent(schema);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${s}.saved_filters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL REFERENCES ${s}.users(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      entity VARCHAR(20) NOT NULL DEFAULT 'issues',
      query TEXT,
      filter JSONB,
      is_shared BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_id, name)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${s}.search_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES ${s}.users(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      entity VARCHAR(20) NOT NULL DEFAULT 'issues',
      result_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_search_history_user_created ON ${s}.search_history (user_id, created_at DESC)`
  );
}

export async function migration038SearchTracking(pool: Pool): Promise<void> {
  await applyToSchema(pool, 'tenant_template');
  const result = await pool.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\\_%'`
  );
  for (const row of result.rows) {
    if (row.schema_name === 'tenant_template') continue;
    await applyToSchema(pool, row.schema_name);
  }
  logger.info('Migration 038 completed: search tracking tables');
}
