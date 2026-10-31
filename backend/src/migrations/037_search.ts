import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Migration 037: Advanced search
 * - Full-text GIN index over issue title + description
 * - Saved filter templates, search history and search analytics tables
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

    const hasIssues = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'issues'`,
      [schema]
    );
    if (hasIssues.rowCount) {
      // Expression index matches the expression used in services/search.ts
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_issues_fts ON ${schema}.issues
        USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')))
      `);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.filter_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        query TEXT,
        filter_group JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_filter_templates_user ON ${schema}.filter_templates(user_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        query TEXT NOT NULL,
        filter_group JSONB,
        result_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_search_history_user ON ${schema}.search_history(user_id, created_at DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        normalized_query TEXT NOT NULL,
        result_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        user_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON ${schema}.search_analytics(normalized_query, created_at DESC)`);
  }
}
