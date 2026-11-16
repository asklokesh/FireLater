import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { SEARCH_ENTITIES } from '../lib/search/entities.js';

/**
 * Migration 037: advanced search (GitHub issue #24)
 *
 * - Weighted full-text GIN expression indexes on issues, problems,
 *   change_requests and kb_articles. The indexed expression is defined once in
 *   lib/search/entities.ts and reused by the query layer so the planner can
 *   match it to the index.
 * - search_history: per-user search log used for recent searches,
 *   autocomplete and analytics.
 * - saved_searches: reusable filter templates (private or shared).
 *
 * Expression indexes avoid rewriting large tables (no stored column).
 * New tenants pick these up because tenant creation clones tenant_template
 * with LIKE ... INCLUDING ALL.
 */
export async function migration037AdvancedSearch(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    // tenantService.getSchemaName() only emits letters, digits and underscores.
    if (!/^tenant_[A-Za-z0-9_]+$/.test(schema)) {
      throw new Error(`Unexpected tenant schema name: ${schema}`);
    }
    const q = `"${schema}"`;

    logger.info({ schema }, 'Applying advanced search migration');

    for (const entity of Object.values(SEARCH_ENTITIES)) {
      const exists = await pool.query(`SELECT to_regclass($1) AS reg`, [`${q}.${entity.table}`]);
      if (!exists.rows[0]?.reg) {
        logger.warn({ schema, table: entity.table }, 'Table missing, skipping search index');
        continue;
      }
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${entity.indexName} ON ${q}.${entity.table} USING gin ((${entity.vector()}))`
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${q}.search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        query_text VARCHAR(500) NOT NULL DEFAULT '',
        normalized_query VARCHAR(500) NOT NULL DEFAULT '',
        filters JSONB NOT NULL DEFAULT '{}',
        entity_types TEXT[] NOT NULL DEFAULT '{}',
        result_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_user_created ON ${q}.search_history (user_id, created_at DESC)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_history_created ON ${q}.search_history (created_at DESC)`
    );
    await pool.query(
      // text_pattern_ops lets prefix LIKE use the index regardless of collation.
      `CREATE INDEX IF NOT EXISTS idx_search_history_normalized ON ${q}.search_history (normalized_query text_pattern_ops)`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${q}.saved_searches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        query_text VARCHAR(500) NOT NULL DEFAULT '',
        filters JSONB NOT NULL DEFAULT '{}',
        entity_types TEXT[] NOT NULL DEFAULT '{}',
        is_shared BOOLEAN NOT NULL DEFAULT false,
        use_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_saved_searches_user_name UNIQUE (user_id, name)
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_saved_searches_shared ON ${q}.saved_searches (is_shared) WHERE is_shared = true`
    );
  }

  logger.info('Migration 037: advanced search indexes and tables created across all tenant schemas');
}
