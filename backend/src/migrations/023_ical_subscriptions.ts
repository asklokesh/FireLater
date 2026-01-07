import { Pool } from 'pg';

export async function migration023IcalSubscriptions(pool: Pool): Promise<void> {
  await up(pool);
}

async function up(pool: Pool, tenantSlug?: string): Promise<void> {
  const schemas: string[] = [];

  if (tenantSlug) {
    schemas.push(`tenant_${tenantSlug.replace(/-/g, '_')}`);
  } else {
    const result = await pool.query(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
    );
    schemas.push(...result.rows.map(r => r.nspname));
  }

  for (const schema of schemas) {
    // Calendar subscriptions table for iCal feed authentication
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.oncall_calendar_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id UUID NOT NULL REFERENCES ${schema}.oncall_schedules(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES ${schema}.users(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL,
        filter_user_id UUID REFERENCES ${schema}.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

        CONSTRAINT unique_calendar_subscription UNIQUE (schedule_id, user_id, filter_user_id)
      )
    `);

    // Add comments for documentation
    await pool.query(`
      COMMENT ON TABLE ${schema}.oncall_calendar_subscriptions IS
      'Stores authentication tokens for iCal calendar subscription URLs'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.oncall_calendar_subscriptions.token IS
      'Secure token used to authenticate calendar subscription requests'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.oncall_calendar_subscriptions.filter_user_id IS
      'If set, calendar only shows shifts for this specific user'
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_subs_schedule ON ${schema}.oncall_calendar_subscriptions(schedule_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_subs_user ON ${schema}.oncall_calendar_subscriptions(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_subs_token ON ${schema}.oncall_calendar_subscriptions(schedule_id, token)
    `);
  }
}

// Rollback function - kept for future migration reversal functionality
async function _down(pool: Pool, tenantSlug?: string): Promise<void> {
  const schemas: string[] = [];

  if (tenantSlug) {
    schemas.push(`tenant_${tenantSlug.replace(/-/g, '_')}`);
  } else {
    const result = await pool.query(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
    );
    schemas.push(...result.rows.map(r => r.nspname));
  }

  for (const schema of schemas) {
    // Drop indexes first
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_calendar_subs_token`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_calendar_subs_user`);
    await pool.query(`DROP INDEX IF EXISTS ${schema}.idx_calendar_subs_schedule`);

    // Drop table
    await pool.query(`DROP TABLE IF EXISTS ${schema}.oncall_calendar_subscriptions CASCADE`);
  }
}
