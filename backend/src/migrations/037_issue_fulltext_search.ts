import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { ISSUE_TSVECTOR_EXPR } from '../utils/searchFilterBuilder.js';

export async function migration037IssueFulltextSearch(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying issue full-text search migration');
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_issues_fulltext ON ${schema}.issues USING GIN (${ISSUE_TSVECTOR_EXPR})`
    );
  }
}
