import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration037Search(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );

  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);

  // Ensure tenant_template is always included
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying search migration');

    await pool.query(`
      ALTER TABLE ${schema}.issues
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_issues_search_vector
      ON ${schema}.issues USING GIN (search_vector)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.saved_filters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        owner_id UUID NOT NULL REFERENCES ${schema}.users(id) ON DELETE CASCADE,
        definition JSONB NOT NULL,
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (owner_id, name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES ${schema}.users(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        filter JSONB,
        result_count INTEGER,
        took_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_search_history_user_created
      ON ${schema}.search_history(user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_search_history_created
      ON ${schema}.search_history(created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_search_history_query_lower
      ON ${schema}.search_history(lower(query) text_pattern_ops)
    `);
  }
}
