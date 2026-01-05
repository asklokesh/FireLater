import { Pool } from 'pg';

export async function migration025UserSecurityColumns(pool: Pool): Promise<void> {
  await pool.query(`
    -- Add security columns to tenant_template users table
    ALTER TABLE tenant_template.users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_users_locked_until
    ON tenant_template.users(locked_until)
    WHERE locked_until IS NOT NULL;
  `);

  console.log('  ✓ Added failed_login_attempts and locked_until columns to users table');

  // Add columns to all existing tenant schemas
  const tenantSchemas = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    AND schema_name != 'tenant_template'
  `);

  for (const row of tenantSchemas.rows) {
    const schema = row.schema_name;
    await pool.query(`
      ALTER TABLE ${schema}.users
      ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_users_locked_until
      ON ${schema}.users(locked_until)
      WHERE locked_until IS NOT NULL;
    `);
    console.log(`  ✓ Updated ${schema}`);
  }
}
