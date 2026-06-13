import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// ============================================
// MIGRATION 027: Audit Chain (WORM + Hash-Chaining)
// ============================================

export async function migration027AuditChain(pool: Pool): Promise<void> {
  // Apply to tenant_template first
  await applyToSchema(pool, 'tenant_template');

  // Apply to all existing tenant schemas
  const tenantsResult = await pool.query(`SELECT slug FROM tenants`);
  for (const tenant of tenantsResult.rows) {
    const schema = `tenant_${tenant.slug.replace(/[^a-z0-9-]/gi, '').replace(/-/g, '_')}`;
    await applyToSchema(pool, schema);
  }

  logger.info('Migration 027 completed: Audit chain columns (WORM + hash-chaining)');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  // Add new WORM / hash-chain columns to audit_logs (idempotent)
  await pool.query(`
    DO $$
    BEGIN
      -- sequence: monotonically increasing per tenant (BIGSERIAL adds its own sequence)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'sequence'
      ) THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN sequence BIGSERIAL;
      END IF;

      -- prev_hash: SHA-256 of the previous record (NULL for genesis record)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'prev_hash'
      ) THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN prev_hash VARCHAR(64);
      END IF;

      -- record_hash: SHA-256 over canonical payload + prev_hash
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'record_hash'
      ) THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN record_hash VARCHAR(64);
      END IF;

      -- retention_until: timestamp after which the record may be purged
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'retention_until'
      ) THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN retention_until TIMESTAMPTZ;
      END IF;

      -- legal_hold: when true, blocks purge regardless of retention_until
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'legal_hold'
      ) THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN legal_hold BOOLEAN DEFAULT false;
      END IF;
    END $$
  `);

  // Indexes for the new columns
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_sequence ON ${schema}.audit_logs(sequence)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_retention_until ON ${schema}.audit_logs(retention_until)`
  );

  logger.debug(`Migration 027 applied to schema: ${schema}`);
}
