import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Migration 038: per-user language preference (i18n).
 *
 * Adds users.locale (base language code such as "en", "ar", "zh"; NULL = not chosen, so Accept-Language applies) to every tenant schema and to
 * tenant_template, so new tenants pick it up when they clone the template.
 */
export async function migration038UserLocale(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    if (!/^tenant_[A-Za-z0-9_]+$/.test(schema)) {
      throw new Error(`Unexpected tenant schema name: ${schema}`);
    }
    const q = `"${schema}"`;
    const exists = await pool.query(`SELECT to_regclass($1) AS reg`, [`${q}.users`]);
    if (!exists.rows[0]?.reg) {
      logger.warn({ schema }, 'users table missing, skipping locale column');
      continue;
    }
    await pool.query(`ALTER TABLE ${q}.users ADD COLUMN IF NOT EXISTS locale VARCHAR(10)`);
  }

  logger.info('Migration 038: users.locale added across all tenant schemas');
}
