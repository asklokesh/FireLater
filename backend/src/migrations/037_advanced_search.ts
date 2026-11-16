import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { searchConfig } from '../services/search/config.js';

const INDEXES = [
  { name: 'idx_issues_search_fts', entity: 'issues' as const },
  { name: 'idx_problems_search_fts', entity: 'problems' as const },
  { name: 'idx_service_requests_search_fts', entity: 'requests' as const },
];

async function getSchemas(pool: Pool): Promise<string[]> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }
  return schemas;
}

export async function migration037AdvancedSearch(pool: Pool): Promise<void> {
  const schemas = await getSchemas(pool);

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying advanced search migration');

    for (const idx of INDEXES) {
      const cfg = searchConfig[idx.entity];
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${schema}.${cfg.table} USING gin ((${cfg.tsvector}))`
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.saved_filters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        entity VARCHAR(50) NOT NULL,
        definition JSONB NOT NULL DEFAULT '{}',
        is_shared BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (owner_id, name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        query TEXT NOT NULL,
        entity VARCHAR(50) NOT NULL,
        filter JSONB,
        result_count INTEGER,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_user_created ON ${schema}.search_history(user_id, created_at DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_created ON ${schema}.search_history(created_at)`
    );
  }

  logger.info('Migration 037 completed: Advanced search');
}

export async function migration037AdvancedSearchDown(pool: Pool): Promise<void> {
  const schemas = await getSchemas(pool);

  for (const schema of schemas) {
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_search_history_created`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_search_history_user_created`);
    await pool.query(`DROP TABLE IF EXISTS ${schema}.search_history`);
    await pool.query(`DROP TABLE IF EXISTS ${schema}.saved_filters`);
    for (const idx of INDEXES) {
      await pool.query(`DROP INDEX IF EXISTS ${schema}.${idx.name}`);
    }
  }

  logger.info('Migration 037 rolled back: Advanced search');
}
