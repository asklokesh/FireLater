import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration033Recertification(pool: Pool): Promise<void> {
  // Apply to tenant_template first
  await applyToSchema(pool, 'tenant_template');
  logger.info('Created recertification tables in tenant_template');

  // Apply to all existing tenant schemas
  const tenantSchemas = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    AND schema_name != 'tenant_template'
  `);

  for (const row of tenantSchemas.rows) {
    const schema = row.schema_name;
    await applyToSchema(pool, schema);
    logger.info({ schema }, 'Created recertification tables in tenant schema');
  }

  logger.info('Migration 033: recertification tables created in all schemas');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.recertification_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      scope_type VARCHAR(50) NOT NULL CHECK (scope_type IN ('all_users','role','group','resource')),
      scope_value VARCHAR(255),
      owner_id VARCHAR(255) NOT NULL,
      owner_email VARCHAR(255),
      due_date TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','active','completed','cancelled')),
      total_items INT DEFAULT 0,
      reviewed_items INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${schema}.recertification_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES ${schema}.recertification_campaigns(id) ON DELETE CASCADE,
      user_id VARCHAR(255) NOT NULL,
      user_email VARCHAR(255),
      user_name VARCHAR(255),
      resource_type VARCHAR(100) NOT NULL,
      resource_id VARCHAR(255) NOT NULL,
      resource_name VARCHAR(255),
      reviewer_id VARCHAR(255),
      reviewer_email VARCHAR(255),
      decision VARCHAR(20) CHECK (decision IN ('approved','revoked','delegated')),
      decision_comment TEXT,
      decided_at TIMESTAMPTZ,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','decided','escalated')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${schema}.recertification_reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES ${schema}.recertification_campaigns(id),
      sent_to VARCHAR(255) NOT NULL,
      reminder_type VARCHAR(50) DEFAULT 'due_soon',
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_recert_campaigns_status ON ${schema}.recertification_campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_recert_items_campaign ON ${schema}.recertification_items(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_recert_items_reviewer ON ${schema}.recertification_items(reviewer_id, status);
  `);
}
