import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration030MakerChecker(pool: Pool): Promise<void> {
  // Apply to tenant_template first
  await pool.query(`
    -- ============================================
    -- MAKER-CHECKER (FOUR-EYES) TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS tenant_template.pending_operations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operation_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100),
      entity_id VARCHAR(255),
      maker_id VARCHAR(255) NOT NULL,
      maker_email VARCHAR(255),
      checker_id VARCHAR(255),
      checker_email VARCHAR(255),
      payload JSONB NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
      justification TEXT,
      checker_comment TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pending_ops_status
      ON tenant_template.pending_operations(status);

    CREATE INDEX IF NOT EXISTS idx_pending_ops_maker
      ON tenant_template.pending_operations(maker_id);

    CREATE INDEX IF NOT EXISTS idx_pending_ops_expires
      ON tenant_template.pending_operations(expires_at)
      WHERE status = 'pending';

    -- Registry of operation types that require maker-checker
    CREATE TABLE IF NOT EXISTS tenant_template.maker_checker_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operation_type VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      expiry_hours INT DEFAULT 24,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Seed default operation types
    INSERT INTO tenant_template.maker_checker_config (operation_type, description, expiry_hours)
    VALUES
      ('privileged_access_grant', 'Grant of elevated or privileged access to a user', 24),
      ('config_change', 'Changes to system or application configuration', 48),
      ('role_assignment', 'Assignment of roles to users', 24),
      ('production_change', 'Changes deployed to the production environment', 24)
    ON CONFLICT (operation_type) DO NOTHING;
  `);

  logger.info('Created maker_checker tables in tenant_template');

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
      CREATE TABLE IF NOT EXISTS ${schema}.pending_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operation_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id VARCHAR(255),
        maker_id VARCHAR(255) NOT NULL,
        maker_email VARCHAR(255),
        checker_id VARCHAR(255),
        checker_email VARCHAR(255),
        payload JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
        justification TEXT,
        checker_comment TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pending_ops_status
        ON ${schema}.pending_operations(status);

      CREATE INDEX IF NOT EXISTS idx_pending_ops_maker
        ON ${schema}.pending_operations(maker_id);

      CREATE INDEX IF NOT EXISTS idx_pending_ops_expires
        ON ${schema}.pending_operations(expires_at)
        WHERE status = 'pending';

      CREATE TABLE IF NOT EXISTS ${schema}.maker_checker_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operation_type VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        expiry_hours INT DEFAULT 24,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      INSERT INTO ${schema}.maker_checker_config (operation_type, description, expiry_hours)
      VALUES
        ('privileged_access_grant', 'Grant of elevated or privileged access to a user', 24),
        ('config_change', 'Changes to system or application configuration', 48),
        ('role_assignment', 'Assignment of roles to users', 24),
        ('production_change', 'Changes deployed to the production environment', 24)
      ON CONFLICT (operation_type) DO NOTHING;
    `);
    logger.info({ schema }, 'Created maker_checker tables in tenant schema');
  }

  logger.info('Migration 030 complete: maker-checker tables created');
}
