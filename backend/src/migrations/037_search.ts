import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration037Search(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying search migration');

    // Generated tsvector column: title weighted above description
    await pool.query(`
      ALTER TABLE ${schema}.issues
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_issues_search_vector ON ${schema}.issues USING GIN (search_vector)`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.saved_filters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        query TEXT,
        filter JSONB NOT NULL DEFAULT '{}',
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON ${schema}.saved_filters(user_id)`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        query TEXT NOT NULL,
        result_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_user ON ${schema}.search_history(user_id, created_at DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_query ON ${schema}.search_history(query)`
    );
  }
}
