import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration035PrivilegedGrants(pool: Pool): Promise<void> {
  // Apply to tenant_template and all existing tenants
  const schemas: string[] = ['tenant_template'];

  const tenantsResult = await pool.query('SELECT slug FROM tenants');
  for (const row of tenantsResult.rows) {
    schemas.push(`tenant_${row.slug.replace(/[^a-z0-9]/gi, '_')}`);
  }

  for (const schema of schemas) {
    await pool.query(`
      -- ============================================
      -- PRIVILEGED ACCESS MANAGEMENT TABLES
      -- ============================================

      -- Tracks JIT privilege elevation requests and their lifecycle
      CREATE TABLE IF NOT EXISTS ${schema}.privileged_grants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id VARCHAR(255) NOT NULL,
        requester_email VARCHAR(255),
        approver_id VARCHAR(255),
        approver_email VARCHAR(255),
        privilege_type VARCHAR(100) NOT NULL,
        resource VARCHAR(255),
        reason TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','active','expired','revoked')),
        requested_duration_hours INT NOT NULL,
        granted_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        revoked_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Session activity log for active privileged grants
      CREATE TABLE IF NOT EXISTS ${schema}.privileged_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        grant_id UUID NOT NULL REFERENCES ${schema}.privileged_grants(id),
        user_id VARCHAR(255) NOT NULL,
        activity_type VARCHAR(100) NOT NULL,
        activity_detail TEXT,
        ip_address VARCHAR(45),
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Configures which privilege types require JIT and their policies
      CREATE TABLE IF NOT EXISTS ${schema}.jit_privilege_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        privilege_type VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        max_duration_hours INT DEFAULT 8,
        requires_approver BOOLEAN DEFAULT true,
        auto_approve BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_priv_grants_status
        ON ${schema}.privileged_grants(status);

      CREATE INDEX IF NOT EXISTS idx_priv_grants_requester
        ON ${schema}.privileged_grants(requester_id);

      CREATE INDEX IF NOT EXISTS idx_priv_grants_expires
        ON ${schema}.privileged_grants(expires_at)
        WHERE status = 'active';

      CREATE INDEX IF NOT EXISTS idx_priv_sessions_grant
        ON ${schema}.privileged_sessions(grant_id);

      -- Seed default JIT privilege configurations
      INSERT INTO ${schema}.jit_privilege_config
        (privilege_type, description, max_duration_hours, requires_approver, auto_approve)
      VALUES
        ('admin',       'Full administrative access',                       8, true,  false),
        ('db_read',     'Read-only database access for troubleshooting',    4, true,  false),
        ('prod_deploy', 'Ability to trigger production deployments',        2, true,  false)
      ON CONFLICT (privilege_type) DO NOTHING;
    `);

    logger.info({ schema }, 'Created PAM tables (privileged_grants, privileged_sessions, jit_privilege_config)');
  }
}
