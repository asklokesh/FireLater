import type { Pool } from 'pg';
import { logger } from '../utils/logger.js';

// ============================================
// MIGRATION 009: Notification Delivery Tracking
// ============================================

export async function migration009NotificationDelivery(pool: Pool): Promise<void> {
  // Apply to tenant_template
  await applyToSchema(pool, 'tenant_template');

  // Apply to existing tenant schemas
  const tenantsResult = await pool.query(`SELECT slug FROM tenants`);
  for (const tenant of tenantsResult.rows) {
    await applyToSchema(pool, `tenant_${tenant.slug}`);
  }

  logger.info('Migration 009 completed: Notification delivery tracking');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`
    -- Notification delivery tracking table
    CREATE TABLE IF NOT EXISTS ${schema}.notification_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id UUID REFERENCES ${schema}.notifications(id) ON DELETE SET NULL,
      channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'slack', 'webhook', 'sms')),
      recipient VARCHAR(255) NOT NULL,
      notification_type VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
      attempts INT DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      error_message TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
      ON ${schema}.notification_deliveries(notification_id);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
      ON ${schema}.notification_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel
      ON ${schema}.notification_deliveries(channel);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created
      ON ${schema}.notification_deliveries(created_at);

    -- Slack integration settings table
    CREATE TABLE IF NOT EXISTS ${schema}.slack_integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      webhook_url TEXT NOT NULL,
      channel_name VARCHAR(100),
      is_default BOOLEAN DEFAULT false,
      notification_types TEXT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES ${schema}.users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Email settings per user
    ALTER TABLE ${schema}.users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

    -- Update notification preferences to include more options
    ALTER TABLE ${schema}.users
      ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(50);
  `);

  logger.debug(`Migration 009 applied to schema: ${schema}`);
}
