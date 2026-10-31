import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Full-text search support: generated tsvector columns with GIN indexes on
 * issues and problems, plus saved filter templates and search history tables.
 */
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

    for (const table of ['issues', 'problems']) {
      const exists = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, table]
      );
      if (exists.rowCount === 0) continue;

      await pool.query(`
        ALTER TABLE ${schema}.${table}
        ADD COLUMN IF NOT EXISTS search_tsvector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_search_tsvector
        ON ${schema}.${table} USING GIN (search_tsvector)
      `);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.filter_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        entity_type VARCHAR(50) NOT NULL DEFAULT 'issue',
        query TEXT,
        filter JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, name)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_filter_templates_user ON ${schema}.filter_templates(user_id)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        query TEXT NOT NULL,
        entity_type VARCHAR(50) NOT NULL DEFAULT 'issue',
        filter JSONB,
        result_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
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
  }
}
