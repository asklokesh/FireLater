import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration031EmergencyChange(pool: Pool): Promise<void> {
  // Apply to tenant_template first
  await pool.query(`
    -- Add emergency fields to existing change_requests table
    ALTER TABLE tenant_template.change_requests
      ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS emergency_justification TEXT,
      ADD COLUMN IF NOT EXISTS linked_incident_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS post_review_status VARCHAR(20) CHECK (post_review_status IN ('pending','approved','rejected')) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS post_reviewer_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS post_reviewer_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS post_review_comment TEXT,
      ADD COLUMN IF NOT EXISTS post_review_due_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS post_reviewed_at TIMESTAMPTZ;

    -- Track auto-queued CAB agenda items for emergency changes
    CREATE TABLE IF NOT EXISTS tenant_template.emergency_change_cab_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      change_id VARCHAR(255) NOT NULL,
      cab_meeting_id VARCHAR(255),
      status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued','assigned','reviewed')),
      queued_at TIMESTAMPTZ DEFAULT NOW(),
      assigned_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_ec_cab_queue_status ON tenant_template.emergency_change_cab_queue(status);
  `);

  logger.info('Applied emergency change migration to tenant_template');

  // Apply to all existing tenant schemas
  const tenantSchemas = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    AND schema_name != 'tenant_template'
  `);

  for (const row of tenantSchemas.rows) {
    const schema = row.schema_name;
    await pool.query(`
      ALTER TABLE ${schema}.change_requests
        ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS emergency_justification TEXT,
        ADD COLUMN IF NOT EXISTS linked_incident_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS post_review_status VARCHAR(20) CHECK (post_review_status IN ('pending','approved','rejected')) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS post_reviewer_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS post_reviewer_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS post_review_comment TEXT,
        ADD COLUMN IF NOT EXISTS post_review_due_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS post_reviewed_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS ${schema}.emergency_change_cab_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        change_id VARCHAR(255) NOT NULL,
        cab_meeting_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued','assigned','reviewed')),
        queued_at TIMESTAMPTZ DEFAULT NOW(),
        assigned_at TIMESTAMPTZ,
        reviewed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_ec_cab_queue_status ON ${schema}.emergency_change_cab_queue(status);
    `);
    logger.info({ schema }, 'Applied emergency change migration to tenant schema');
  }
}
