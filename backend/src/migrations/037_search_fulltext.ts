import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { SEARCH_TSVECTOR_EXPR } from '../lib/search-query.js';

// MIGRATION 037: GIN full-text indexes for issues and problems.
// Expression indexes only: no GENERATED columns, since tenant creation clones
// tenant_template with INSERT ... SELECT *.

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  const s = quoteIdent(schema);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_issues_fts ON ${s}.issues USING GIN ((${SEARCH_TSVECTOR_EXPR}))`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_problems_fts ON ${s}.problems USING GIN ((${SEARCH_TSVECTOR_EXPR}))`
  );
}

export async function migration037SearchFulltext(pool: Pool): Promise<void> {
  await applyToSchema(pool, 'tenant_template');
  const result = await pool.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\\_%'`
  );
  for (const row of result.rows) {
    if (row.schema_name === 'tenant_template') continue;
    await applyToSchema(pool, row.schema_name);
  }
  logger.info('Migration 037 completed: full-text search indexes');
}
