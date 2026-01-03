import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration015Workflows(pool: Pool): Promise<void> {
  await pool.query(`
    -- ============================================
    -- WORKFLOW AUTOMATION MODULE
    -- ============================================
    -- Business rule automation for issues, problems,
    -- changes, and service requests

    SET search_path TO tenant_template;

    -- ============================================
    -- WORKFLOW RULES
    -- ============================================

    CREATE TABLE IF NOT EXISTS workflow_rules (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(100) NOT NULL,
        description     VARCHAR(500),

        -- Target and trigger
        entity_type     VARCHAR(50) NOT NULL,
        trigger_type    VARCHAR(50) NOT NULL,

        -- Rule state
        is_active       BOOLEAN DEFAULT true,

        -- Conditions and actions stored as JSON
        conditions      JSONB DEFAULT '[]',
        actions         JSONB DEFAULT '[]',

        -- Execution control
        execution_order INTEGER DEFAULT 0,
        stop_on_match   BOOLEAN DEFAULT false,

        -- Ownership
        created_by      UUID REFERENCES users(id),
        updated_by      UUID REFERENCES users(id),

        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_rules_entity ON workflow_rules(entity_type);
    CREATE INDEX IF NOT EXISTS idx_workflow_rules_trigger ON workflow_rules(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_workflow_rules_active ON workflow_rules(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_workflow_rules_order ON workflow_rules(entity_type, trigger_type, execution_order);

    -- ============================================
    -- WORKFLOW EXECUTION LOGS
    -- ============================================

    CREATE TABLE IF NOT EXISTS workflow_execution_logs (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id             UUID REFERENCES workflow_rules(id) ON DELETE SET NULL,
        rule_name           VARCHAR(100),

        -- Entity that triggered the workflow
        entity_type         VARCHAR(50) NOT NULL,
        entity_id           UUID NOT NULL,

        -- Trigger information
        trigger_type        VARCHAR(50) NOT NULL,

        -- Execution results
        conditions_matched  BOOLEAN DEFAULT false,
        actions_executed    JSONB DEFAULT '[]',

        -- Performance
        execution_time_ms   INTEGER,

        -- Error tracking
        error               TEXT,
        error_details       JSONB,

        executed_at         TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_wf_logs_rule ON workflow_execution_logs(rule_id);
    CREATE INDEX IF NOT EXISTS idx_wf_logs_entity ON workflow_execution_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_wf_logs_executed ON workflow_execution_logs(executed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wf_logs_errors ON workflow_execution_logs(rule_id) WHERE error IS NOT NULL;

    -- ============================================
    -- WORKFLOW PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('workflows', 'create', 'Create workflow rules'),
        ('workflows', 'read', 'View workflow rules'),
        ('workflows', 'update', 'Update workflow rules'),
        ('workflows', 'delete', 'Delete workflow rules'),
        ('workflows', 'execute', 'Manually execute workflow rules'),
        ('workflow_logs', 'read', 'View workflow execution logs')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Grant permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('workflows', 'workflow_logs')
    ON CONFLICT DO NOTHING;

    -- Grant read permissions to manager role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND (p.resource, p.action) IN (
        ('workflows', 'read'),
        ('workflow_logs', 'read')
    )
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);

  // Apply to existing tenant schemas
  const tenantsResult = await pool.query(`
    SELECT slug FROM public.tenants WHERE status = 'active'
  `);

  for (const tenant of tenantsResult.rows) {
    const schema = `tenant_${tenant.slug.replace(/-/g, '_')}`;

    try {
      await pool.query(`
        SET search_path TO ${schema};

        -- Workflow Rules
        CREATE TABLE IF NOT EXISTS workflow_rules (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name            VARCHAR(100) NOT NULL,
            description     VARCHAR(500),
            entity_type     VARCHAR(50) NOT NULL,
            trigger_type    VARCHAR(50) NOT NULL,
            is_active       BOOLEAN DEFAULT true,
            conditions      JSONB DEFAULT '[]',
            actions         JSONB DEFAULT '[]',
            execution_order INTEGER DEFAULT 0,
            stop_on_match   BOOLEAN DEFAULT false,
            created_by      UUID REFERENCES users(id),
            updated_by      UUID REFERENCES users(id),
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_workflow_rules_entity ON workflow_rules(entity_type);
        CREATE INDEX IF NOT EXISTS idx_workflow_rules_trigger ON workflow_rules(trigger_type);
        CREATE INDEX IF NOT EXISTS idx_workflow_rules_active ON workflow_rules(is_active) WHERE is_active = true;
        CREATE INDEX IF NOT EXISTS idx_workflow_rules_order ON workflow_rules(entity_type, trigger_type, execution_order);

        -- Workflow Execution Logs
        CREATE TABLE IF NOT EXISTS workflow_execution_logs (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            rule_id             UUID REFERENCES workflow_rules(id) ON DELETE SET NULL,
            rule_name           VARCHAR(100),
            entity_type         VARCHAR(50) NOT NULL,
            entity_id           UUID NOT NULL,
            trigger_type        VARCHAR(50) NOT NULL,
            conditions_matched  BOOLEAN DEFAULT false,
            actions_executed    JSONB DEFAULT '[]',
            execution_time_ms   INTEGER,
            error               TEXT,
            error_details       JSONB,
            executed_at         TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_wf_logs_rule ON workflow_execution_logs(rule_id);
        CREATE INDEX IF NOT EXISTS idx_wf_logs_entity ON workflow_execution_logs(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_wf_logs_executed ON workflow_execution_logs(executed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_wf_logs_errors ON workflow_execution_logs(rule_id) WHERE error IS NOT NULL;

        -- Add permissions
        INSERT INTO permissions (resource, action, description) VALUES
            ('workflows', 'create', 'Create workflow rules'),
            ('workflows', 'read', 'View workflow rules'),
            ('workflows', 'update', 'Update workflow rules'),
            ('workflows', 'delete', 'Delete workflow rules'),
            ('workflows', 'execute', 'Manually execute workflow rules'),
            ('workflow_logs', 'read', 'View workflow execution logs')
        ON CONFLICT (resource, action) DO NOTHING;

        -- Grant permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'admin'
        AND p.resource IN ('workflows', 'workflow_logs')
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'manager'
        AND (p.resource, p.action) IN (
            ('workflows', 'read'),
            ('workflow_logs', 'read')
        )
        ON CONFLICT DO NOTHING;

        RESET search_path;
      `);
    } catch (err) {
      logger.error({ err, tenantSlug: tenant.slug }, 'Failed to apply workflow migration to tenant');
    }
  }
}
