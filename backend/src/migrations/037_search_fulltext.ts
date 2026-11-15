import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// ============================================
// MIGRATION 037: Full-text search on issues
// ============================================

export async function migration037SearchFulltext(pool: Pool): Promise<void> {
  await applyToSchema(pool, 'tenant_template');

  const tenantsResult = await pool.query(`SELECT slug FROM tenants`);
  for (const tenant of tenantsResult.rows) {
    await applyToSchema(pool, `tenant_${tenant.slug}`);
  }

  logger.info('Migration 037 completed: Issue full-text search');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`
    ALTER TABLE ${schema}.issues
      ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(issue_number, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'C')
      ) STORED;

    CREATE INDEX IF NOT EXISTS idx_issues_search_vector
      ON ${schema}.issues USING GIN (search_vector);
  `);
}
