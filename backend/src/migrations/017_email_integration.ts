import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration017EmailIntegration(pool: Pool): Promise<void> {
  await pool.query(`
    -- ============================================
    -- EMAIL-TO-TICKET INTEGRATION MODULE
    -- ============================================
    -- Enables automatic ticket creation from emails

    SET search_path TO tenant_template;

    -- ============================================
    -- EMAIL CONFIGURATIONS TABLE
    -- ============================================

    CREATE TABLE IF NOT EXISTS email_configs (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                    VARCHAR(100) NOT NULL,
        email_address           VARCHAR(255) NOT NULL UNIQUE,
        provider                VARCHAR(50) NOT NULL,
        is_active               BOOLEAN DEFAULT true,

        -- Default ticket settings
        default_priority        VARCHAR(20) DEFAULT 'medium',
        default_application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
        default_assigned_group  UUID REFERENCES groups(id) ON DELETE SET NULL,

        -- Auto-reply settings
        auto_reply_enabled      BOOLEAN DEFAULT false,
        auto_reply_template     TEXT,

        -- Spam filtering
        spam_filter_enabled     BOOLEAN DEFAULT true,
        allowed_domains         JSONB DEFAULT '[]',
        blocked_domains         JSONB DEFAULT '[]',

        -- Metadata
        created_by              UUID REFERENCES users(id),
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        updated_at              TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_email_configs_email ON email_configs(email_address);
    CREATE INDEX IF NOT EXISTS idx_email_configs_active ON email_configs(is_active) WHERE is_active = true;

    -- ============================================
    -- EMAIL LOGS TABLE
    -- ============================================

    CREATE TABLE IF NOT EXISTS email_logs (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email_config_id     UUID REFERENCES email_configs(id) ON DELETE SET NULL,

        -- Email details
        from_email          VARCHAR(255) NOT NULL,
        from_name           VARCHAR(200),
        to_email            VARCHAR(255) NOT NULL,
        subject             VARCHAR(500),
        message_id          VARCHAR(500),
        in_reply_to         VARCHAR(500),

        -- Processing result
        action              VARCHAR(50) NOT NULL,
        issue_id            UUID REFERENCES issues(id) ON DELETE SET NULL,
        success             BOOLEAN NOT NULL,
        error_message       TEXT,

        -- Timestamps
        created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_email_logs_config ON email_logs(email_config_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_issue ON email_logs(issue_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_logs_action ON email_logs(action);
    CREATE INDEX IF NOT EXISTS idx_email_logs_success ON email_logs(success);

    -- ============================================
    -- ADD SOURCE TRACKING TO ISSUES
    -- ============================================

    -- Add source column to issues table if not exists
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'tenant_template'
            AND table_name = 'issues'
            AND column_name = 'source'
        ) THEN
            ALTER TABLE issues ADD COLUMN source VARCHAR(50);
            ALTER TABLE issues ADD COLUMN source_ref VARCHAR(255);
            CREATE INDEX IF NOT EXISTS idx_issues_source ON issues(source);
        END IF;
    END $$;

    -- Add source column to issue_comments table if not exists
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'tenant_template'
            AND table_name = 'issue_comments'
            AND column_name = 'source'
        ) THEN
            ALTER TABLE issue_comments ADD COLUMN source VARCHAR(50);
        END IF;
    END $$;

    -- ============================================
    -- EMAIL PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('email_configs', 'create', 'Create email configurations'),
        ('email_configs', 'read', 'View email configurations'),
        ('email_configs', 'update', 'Update email configurations'),
        ('email_configs', 'delete', 'Delete email configurations'),
        ('email_logs', 'read', 'View email logs')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Grant permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('email_configs', 'email_logs')
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

        -- Email Configs
        CREATE TABLE IF NOT EXISTS email_configs (
            id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                    VARCHAR(100) NOT NULL,
            email_address           VARCHAR(255) NOT NULL UNIQUE,
            provider                VARCHAR(50) NOT NULL,
            is_active               BOOLEAN DEFAULT true,
            default_priority        VARCHAR(20) DEFAULT 'medium',
            default_application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
            default_assigned_group  UUID REFERENCES groups(id) ON DELETE SET NULL,
            auto_reply_enabled      BOOLEAN DEFAULT false,
            auto_reply_template     TEXT,
            spam_filter_enabled     BOOLEAN DEFAULT true,
            allowed_domains         JSONB DEFAULT '[]',
            blocked_domains         JSONB DEFAULT '[]',
            created_by              UUID REFERENCES users(id),
            created_at              TIMESTAMPTZ DEFAULT NOW(),
            updated_at              TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_email_configs_email ON email_configs(email_address);
        CREATE INDEX IF NOT EXISTS idx_email_configs_active ON email_configs(is_active) WHERE is_active = true;

        -- Email Logs
        CREATE TABLE IF NOT EXISTS email_logs (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email_config_id     UUID REFERENCES email_configs(id) ON DELETE SET NULL,
            from_email          VARCHAR(255) NOT NULL,
            from_name           VARCHAR(200),
            to_email            VARCHAR(255) NOT NULL,
            subject             VARCHAR(500),
            message_id          VARCHAR(500),
            in_reply_to         VARCHAR(500),
            action              VARCHAR(50) NOT NULL,
            issue_id            UUID REFERENCES issues(id) ON DELETE SET NULL,
            success             BOOLEAN NOT NULL,
            error_message       TEXT,
            created_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_email_logs_config ON email_logs(email_config_id);
        CREATE INDEX IF NOT EXISTS idx_email_logs_issue ON email_logs(issue_id);
        CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_email_logs_action ON email_logs(action);
        CREATE INDEX IF NOT EXISTS idx_email_logs_success ON email_logs(success);

        -- Add source tracking to issues
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = '${schema}'
                AND table_name = 'issues'
                AND column_name = 'source'
            ) THEN
                ALTER TABLE issues ADD COLUMN source VARCHAR(50);
                ALTER TABLE issues ADD COLUMN source_ref VARCHAR(255);
                CREATE INDEX IF NOT EXISTS idx_issues_source ON issues(source);
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = '${schema}'
                AND table_name = 'issue_comments'
                AND column_name = 'source'
            ) THEN
                ALTER TABLE issue_comments ADD COLUMN source VARCHAR(50);
            END IF;
        END $$;

        -- Add permissions
        INSERT INTO permissions (resource, action, description) VALUES
            ('email_configs', 'create', 'Create email configurations'),
            ('email_configs', 'read', 'View email configurations'),
            ('email_configs', 'update', 'Update email configurations'),
            ('email_configs', 'delete', 'Delete email configurations'),
            ('email_logs', 'read', 'View email logs')
        ON CONFLICT (resource, action) DO NOTHING;

        -- Grant permissions to admin role
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'admin'
        AND p.resource IN ('email_configs', 'email_logs')
        ON CONFLICT DO NOTHING;

        RESET search_path;
      `);
    } catch (err) {
      logger.error({ err, tenantSlug: tenant.slug }, 'Failed to apply email integration migration to tenant');
    }
  }
}
