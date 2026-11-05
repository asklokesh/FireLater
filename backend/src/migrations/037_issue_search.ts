import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration037IssueSearch(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying issue search migration');

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
  }
}
