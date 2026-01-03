import { Pool } from 'pg';

export async function migration019RcaTools(pool: Pool): Promise<void> {
  await up(pool);
}

async function up(pool: Pool, tenantSlug?: string): Promise<void> {
  // If tenantSlug is provided, only apply to that tenant's schema
  // Otherwise, apply to all tenant schemas

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
    // Add rca_data JSONB column to problems table for structured RCA
    await pool.query(`
      ALTER TABLE ${schema}.problems
      ADD COLUMN IF NOT EXISTS rca_data JSONB DEFAULT NULL
    `);

    // Add comment explaining the structure
    await pool.query(`
      COMMENT ON COLUMN ${schema}.problems.rca_data IS
      'Structured RCA data including five_whys (array of {why, answer}) and fishbone (object with categories as keys and arrays of causes as values)'
    `);
  }
}

async function down(pool: Pool, tenantSlug?: string): Promise<void> {
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
    await pool.query(`
      ALTER TABLE ${schema}.problems
      DROP COLUMN IF EXISTS rca_data
    `);
  }
}
