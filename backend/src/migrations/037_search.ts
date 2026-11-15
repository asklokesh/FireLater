import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { ISSUES_TSVECTOR, PROBLEMS_TSVECTOR, SERVICE_REQUESTS_TSVECTOR } from '../lib/search-fts.js';

async function getSchemas(pool: Pool): Promise<string[]> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );
  const schemas: string[] = (schemasResult?.rows ?? []).map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }
  return schemas;
}

export async function migration037Search(pool: Pool): Promise<void> {
  const schemas = await getSchemas(pool);

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying search migration');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_issues_fts ON ${schema}.issues USING GIN (${ISSUES_TSVECTOR})`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_problems_fts ON ${schema}.problems USING GIN (${PROBLEMS_TSVECTOR})`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_service_requests_fts ON ${schema}.service_requests USING GIN (${SERVICE_REQUESTS_TSVECTOR})`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.saved_filters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('issues','problems','requests')),
        definition JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_by UUID NOT NULL REFERENCES ${schema}.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (created_by, entity_type, name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES ${schema}.users(id) ON DELETE CASCADE,
        query VARCHAR(200) NOT NULL,
        entity_types TEXT[],
        result_count INTEGER,
        took_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_user_created ON ${schema}.search_history(user_id, created_at DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_created ON ${schema}.search_history(created_at DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_query ON ${schema}.search_history(lower(query))`
    );
  }
}

export async function migration037SearchDown(pool: Pool): Promise<void> {
  const schemas = await getSchemas(pool);
  for (const schema of schemas) {
    await pool.query(`DROP TABLE IF EXISTS ${schema}.search_history`);
    await pool.query(`DROP TABLE IF EXISTS ${schema}.saved_filters`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_issues_fts`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_problems_fts`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_service_requests_fts`);
  }
}
