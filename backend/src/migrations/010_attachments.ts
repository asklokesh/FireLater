import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// ============================================
// MIGRATION 010: File Attachments
// ============================================

export async function migration010Attachments(pool: Pool): Promise<void> {
  // Apply to tenant_template
  await applyToSchema(pool, 'tenant_template');

  // Apply to existing tenant schemas
  const tenantsResult = await pool.query(`SELECT slug FROM tenants`);
  for (const tenant of tenantsResult.rows) {
    await applyToSchema(pool, `tenant_${tenant.slug}`);
  }

  logger.info('Migration 010 completed: File attachments');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`
    -- File attachments table
    CREATE TABLE IF NOT EXISTS ${schema}.attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Entity reference (polymorphic)
      entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('issue', 'change', 'request', 'application', 'comment')),
      entity_id UUID NOT NULL,

      -- File metadata
      filename VARCHAR(255) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_extension VARCHAR(20),

      -- Storage location
      storage_provider VARCHAR(20) NOT NULL DEFAULT 's3' CHECK (storage_provider IN ('s3', 'local')),
      storage_key VARCHAR(500) NOT NULL,
      storage_bucket VARCHAR(100),

      -- Display options
      is_inline BOOLEAN DEFAULT false,
      thumbnail_key VARCHAR(500),

      -- Metadata
      checksum VARCHAR(64),
      metadata JSONB DEFAULT '{}',

      -- Tracking
      uploaded_by UUID REFERENCES ${schema}.users(id),
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),

      -- Soft delete
      is_deleted BOOLEAN DEFAULT false,
      deleted_at TIMESTAMPTZ,
      deleted_by UUID REFERENCES ${schema}.users(id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_attachments_entity
      ON ${schema}.attachments(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by
      ON ${schema}.attachments(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_at
      ON ${schema}.attachments(uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_attachments_storage_key
      ON ${schema}.attachments(storage_key);

    -- Storage quota tracking per tenant (optional)
    CREATE TABLE IF NOT EXISTS ${schema}.storage_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type VARCHAR(50) NOT NULL,
      total_files INT DEFAULT 0,
      total_size BIGINT DEFAULT 0,
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(entity_type)
    );

    -- Function to update storage usage
    CREATE OR REPLACE FUNCTION ${schema}.update_storage_usage()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO ${schema}.storage_usage (entity_type, total_files, total_size)
        VALUES (NEW.entity_type, 1, NEW.file_size)
        ON CONFLICT (entity_type) DO UPDATE SET
          total_files = ${schema}.storage_usage.total_files + 1,
          total_size = ${schema}.storage_usage.total_size + NEW.file_size,
          last_updated = NOW();
      ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_deleted = true AND OLD.is_deleted = false) THEN
        UPDATE ${schema}.storage_usage SET
          total_files = GREATEST(total_files - 1, 0),
          total_size = GREATEST(total_size - OLD.file_size, 0),
          last_updated = NOW()
        WHERE entity_type = OLD.entity_type;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger for storage usage
    DROP TRIGGER IF EXISTS trg_update_storage_usage ON ${schema}.attachments;
    CREATE TRIGGER trg_update_storage_usage
    AFTER INSERT OR UPDATE OF is_deleted OR DELETE ON ${schema}.attachments
    FOR EACH ROW EXECUTE FUNCTION ${schema}.update_storage_usage();
  `);

  logger.debug(`Migration 010 applied to schema: ${schema}`);
}
