import { Pool } from 'pg';

export async function migration022FinancialImpact(pool: Pool): Promise<void> {
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
    // Add financial impact columns to problems table
    await pool.query(`
      ALTER TABLE ${schema}.problems
      ADD COLUMN IF NOT EXISTS financial_impact_estimated DECIMAL(15,2) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS financial_impact_actual DECIMAL(15,2) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS financial_impact_currency VARCHAR(3) DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS financial_impact_notes TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS cost_breakdown JSONB DEFAULT NULL
    `);

    // Add comments explaining the columns
    await pool.query(`
      COMMENT ON COLUMN ${schema}.problems.financial_impact_estimated IS
      'Estimated financial impact of the problem in the specified currency'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.problems.financial_impact_actual IS
      'Actual financial impact after resolution in the specified currency'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.problems.financial_impact_currency IS
      'ISO 4217 currency code for financial impact values (default: USD)'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.problems.financial_impact_notes IS
      'Notes explaining the financial impact calculation'
    `);

    await pool.query(`
      COMMENT ON COLUMN ${schema}.problems.cost_breakdown IS
      'Detailed cost breakdown by category: { labor_hours, labor_rate, revenue_loss, recovery_costs, third_party_costs, customer_credits, other }'
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
    await pool.query(`
      ALTER TABLE ${schema}.problems
      DROP COLUMN IF EXISTS financial_impact_estimated,
      DROP COLUMN IF EXISTS financial_impact_actual,
      DROP COLUMN IF EXISTS financial_impact_currency,
      DROP COLUMN IF EXISTS financial_impact_notes,
      DROP COLUMN IF EXISTS cost_breakdown
    `);
  }
}
