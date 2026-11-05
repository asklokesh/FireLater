import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration038SearchTemplatesHistory(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying search templates/history migration');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.saved_filters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        entity_type VARCHAR(50) NOT NULL DEFAULT 'issue',
        query TEXT,
        filter JSONB,
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, entity_type, name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        entity_type VARCHAR(50) NOT NULL DEFAULT 'issue',
        query TEXT,
        filter JSONB,
        result_count INTEGER,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_user_created ON ${schema}.search_history (user_id, created_at DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_created ON ${schema}.search_history (created_at)`
    );
  }
}
