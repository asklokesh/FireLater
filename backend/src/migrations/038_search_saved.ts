import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// ============================================
// MIGRATION 038: Search filter templates and history
// ============================================

export async function migration038SearchSaved(pool: Pool): Promise<void> {
  await applyToSchema(pool, 'tenant_template');

  const tenantsResult = await pool.query(`SELECT slug FROM tenants`);
  for (const tenant of tenantsResult.rows) {
    await applyToSchema(pool, `tenant_${tenant.slug}`);
  }

  logger.info('Migration 038 completed: Search templates and history');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.search_filter_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      query TEXT,
      filters JSONB,
      is_shared BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_search_filter_templates_user_id
      ON ${schema}.search_filter_templates (user_id);
    CREATE INDEX IF NOT EXISTS idx_search_filter_templates_created_at
      ON ${schema}.search_filter_templates (created_at);

    CREATE TABLE IF NOT EXISTS ${schema}.search_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      query TEXT,
      filters JSONB,
      result_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_search_history_user_id
      ON ${schema}.search_history (user_id);
    CREATE INDEX IF NOT EXISTS idx_search_history_created_at
      ON ${schema}.search_history (created_at);
  `);
}
