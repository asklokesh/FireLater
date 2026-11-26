import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

/**
 * Migration 039: audit content digest version + archive column parity
 *
 * - audit_logs.digest_version: the field list a record's content digest was
 *   computed over. NULL (rows sealed before this migration) = version 1, which
 *   did not cover the legacy `changes` column; version 2 covers it. Rows that
 *   are already sealed keep verifying with their own version; nothing is
 *   re-sealed, because re-sealing would vouch for whatever the rows hold today.
 * - audit_logs_archive gets every column of audit_logs it does not have yet,
 *   so archiving moves whole records. Rows that an earlier build archived
 *   without their `changes` value cannot be recovered: the value was not
 *   copied and the live row was deleted. Their digests (version 1) never
 *   covered `changes`, so they still verify.
 */
export async function migration039AuditDigestVersion(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);

  for (const schema of schemas) {
    // tenantService.getSchemaName() only emits letters, digits and underscores.
    if (!/^tenant_[A-Za-z0-9_]+$/.test(schema)) {
      throw new Error(`Unexpected tenant schema name: ${schema}`);
    }
    const hasAudit = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'audit_logs'`,
      [schema]
    );
    if (hasAudit.rowCount === 0) continue;
    await applyToSchema(pool, schema);
    logger.debug(`Migration 039 applied to schema: ${schema}`);
  }

  logger.info('Migration 039 completed: audit digest version and archive column parity');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  const q = `"${schema}"`;
  await pool.query(`ALTER TABLE ${q}.audit_logs ADD COLUMN IF NOT EXISTS digest_version SMALLINT`);

  const hasArchive = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'audit_logs_archive'`,
    [schema]
  );
  if (hasArchive.rowCount === 0) return;

  // Columns of the live table that the archive is missing, with their types.
  const missing = await pool.query(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_attribute a
      WHERE a.attrelid = ($1 || '.audit_logs')::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND NOT EXISTS (
          SELECT 1 FROM pg_attribute b
           WHERE b.attrelid = ($1 || '.audit_logs_archive')::regclass
             AND b.attname = a.attname AND b.attnum > 0 AND NOT b.attisdropped
        )
      ORDER BY a.attnum`,
    [q]
  );
  for (const col of missing.rows as Array<{ name: string; type: string }>) {
    if (!/^[a-z_][a-z0-9_]*$/.test(col.name)) {
      throw new Error(`Unexpected audit_logs column name: ${col.name}`);
    }
    await pool.query(`ALTER TABLE ${q}.audit_logs_archive ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
  }
}
