import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Full-text search support.
 * - Weighted GIN expression indexes (title weight A, description weight B) on
 *   issues, problems and change_requests; service_requests indexes number + notes.
 *   The expressions match services/search.ts exactly so the planner uses them.
 *   Search queries are always LIMIT-capped (see services/search.ts).
 * - filter_templates: saved filter combinations per tenant_id and user_id.
 * - search_history: one row per executed search, used for suggestions and analytics.
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

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_issues_fts ON ${schema}.issues USING GIN (
        (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B'))
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_problems_fts ON ${schema}.problems USING GIN (
        (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B'))
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_change_requests_fts ON ${schema}.change_requests USING GIN (
        (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B'))
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_service_requests_fts ON ${schema}.service_requests USING GIN (
        (setweight(to_tsvector('english', coalesce(request_number, '')), 'A') || setweight(to_tsvector('english', coalesce(notes, '')), 'B'))
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.filter_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        entity VARCHAR(50) NOT NULL,
        query_text TEXT,
        filters JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, user_id, name)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_filter_templates_user ON ${schema}.filter_templates(tenant_id, user_id)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        user_id UUID NOT NULL,
        query_text TEXT NOT NULL,
        entity VARCHAR(50),
        result_count INT NOT NULL DEFAULT 0,
        duration_ms INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_search_history_user ON ${schema}.search_history(tenant_id, user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_search_history_created ON ${schema}.search_history(created_at DESC)
    `);
  }

  logger.info('Search migration completed');
}
