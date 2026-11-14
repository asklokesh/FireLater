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

    await pool.query(`
      ALTER TABLE ${schema}.issues
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english',
          coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(issue_number, ''))
      ) STORED
    `);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_issues_search_vector ON ${schema}.issues USING GIN (search_vector)`
    );

    for (const col of ['status', 'priority', 'severity', 'assigned_group', 'application_id']) {
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_issues_${col}_facet ON ${schema}.issues (${col})`
      );
    }
  }
}
