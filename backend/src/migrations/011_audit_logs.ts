import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// ============================================
// MIGRATION 011: Audit Logging
// ============================================

export async function migration011AuditLogs(pool: Pool): Promise<void> {
  // Apply to tenant_template
  await applyToSchema(pool, 'tenant_template');

  // Apply to existing tenant schemas
  const tenantsResult = await pool.query(`SELECT slug FROM tenants`);
  for (const tenant of tenantsResult.rows) {
    await applyToSchema(pool, `tenant_${tenant.slug}`);
  }

  logger.info('Migration 011 completed: Audit logs');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  // Add new columns to existing audit_logs table if they don't exist
  // The base audit_logs table was created in migration 002
  await pool.query(`
    DO $$
    BEGIN
      -- Add user_email if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'user_email') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN user_email VARCHAR(255);
      END IF;
      -- Add user_name if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'user_name') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN user_name VARCHAR(255);
      END IF;
      -- Add entity_name if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'entity_name') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN entity_name VARCHAR(255);
      END IF;
      -- Add old_values if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'old_values') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN old_values JSONB;
      END IF;
      -- Add new_values if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'new_values') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN new_values JSONB;
      END IF;
      -- Add changed_fields if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'changed_fields') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN changed_fields TEXT[];
      END IF;
      -- Add request_id if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'request_id') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN request_id VARCHAR(100);
      END IF;
      -- Add session_id if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'session_id') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN session_id VARCHAR(100);
      END IF;
      -- Add metadata if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'audit_logs' AND column_name = 'metadata') THEN
        ALTER TABLE ${schema}.audit_logs ADD COLUMN metadata JSONB DEFAULT '{}';
      END IF;
    END $$
  `);

  // Create indexes separately
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON ${schema}.audit_logs(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON ${schema}.audit_logs(action)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON ${schema}.audit_logs(entity_type, entity_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON ${schema}.audit_logs(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON ${schema}.audit_logs(ip_address)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_failed_logins ON ${schema}.audit_logs(user_email, created_at) WHERE action = 'login_failed'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON ${schema}.audit_logs USING GIN (metadata)`);

  // Create audit_settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.audit_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      retention_days INT DEFAULT 365,
      log_reads BOOLEAN DEFAULT false,
      log_exports BOOLEAN DEFAULT true,
      sensitive_fields TEXT[] DEFAULT ARRAY['password', 'token', 'secret', 'api_key'],
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by UUID REFERENCES ${schema}.users(id)
    )
  `);

  // Insert default settings
  await pool.query(`
    INSERT INTO ${schema}.audit_settings (retention_days, log_reads, log_exports)
    SELECT 365, false, true
    WHERE NOT EXISTS (SELECT 1 FROM ${schema}.audit_settings)
  `);

  // Create views
  await pool.query(`
    CREATE OR REPLACE VIEW ${schema}.audit_summary_by_user AS
    SELECT
      user_id,
      user_email,
      user_name,
      action,
      COUNT(*) as action_count,
      MAX(created_at) as last_action
    FROM ${schema}.audit_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY user_id, user_email, user_name, action
    ORDER BY action_count DESC
  `);

  await pool.query(`
    CREATE OR REPLACE VIEW ${schema}.audit_summary_by_entity AS
    SELECT
      entity_type,
      entity_id,
      entity_name,
      COUNT(*) as change_count,
      COUNT(DISTINCT user_id) as unique_users,
      MAX(created_at) as last_modified
    FROM ${schema}.audit_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY entity_type, entity_id, entity_name
    ORDER BY last_modified DESC
  `);

  logger.debug(`Migration 011 applied to schema: ${schema}`);
}
