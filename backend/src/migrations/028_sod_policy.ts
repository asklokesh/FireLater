import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration028SodPolicy(pool: Pool): Promise<void> {
  // ============================================
  // SOD POLICY TABLES (tenant_template + existing tenants)
  // ============================================

  const createTablesSQL = (schema: string) => `
    CREATE TABLE IF NOT EXISTS ${schema}.sod_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      conflicting_role_a VARCHAR(100) NOT NULL,
      conflicting_role_b VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sod_policies_entity_type
      ON ${schema}.sod_policies(entity_type);
    CREATE INDEX IF NOT EXISTS idx_sod_policies_active
      ON ${schema}.sod_policies(is_active) WHERE is_active = true;

    CREATE TABLE IF NOT EXISTS ${schema}.sod_evaluations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_id UUID REFERENCES ${schema}.sod_policies(id),
      actor_id VARCHAR(255) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(255) NOT NULL,
      action VARCHAR(100) NOT NULL,
      decision VARCHAR(10) NOT NULL CHECK (decision IN ('allow','deny')),
      matched_rule VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sod_evaluations_actor
      ON ${schema}.sod_evaluations(actor_id);
    CREATE INDEX IF NOT EXISTS idx_sod_evaluations_entity
      ON ${schema}.sod_evaluations(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_sod_evaluations_policy
      ON ${schema}.sod_evaluations(policy_id);
    CREATE INDEX IF NOT EXISTS idx_sod_evaluations_created
      ON ${schema}.sod_evaluations(created_at DESC);
  `;

  const seedDefaultPoliciesSQL = (schema: string) => `
    INSERT INTO ${schema}.sod_policies
      (name, description, conflicting_role_a, conflicting_role_b, entity_type, is_active)
    VALUES
      (
        'Requester Cannot Approve',
        'Prevents the requester of a change from also approving it — enforces four-eyes principle.',
        'requester',
        'approver',
        'change',
        true
      ),
      (
        'Approver Cannot Implement',
        'Prevents the approver of a change from also implementing it — separates authorisation from execution.',
        'approver',
        'implementer',
        'change',
        true
      )
    ON CONFLICT DO NOTHING;
  `;

  // Apply to tenant_template first
  await pool.query(createTablesSQL('tenant_template'));
  await pool.query(seedDefaultPoliciesSQL('tenant_template'));
  logger.info('Created sod_policies and sod_evaluations tables in tenant_template');

  // Apply to all existing tenant schemas
  const tenantSchemas = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    AND schema_name != 'tenant_template'
  `);

  for (const row of tenantSchemas.rows) {
    const schema = row.schema_name;
    await pool.query(createTablesSQL(schema));
    await pool.query(seedDefaultPoliciesSQL(schema));
    logger.info({ schema }, 'Created SoD tables in tenant schema');
  }

  logger.info(
    `Migration 028 complete: created sod_policies and sod_evaluations in tenant_template and ${tenantSchemas.rows.length} existing tenant schemas`
  );
}
