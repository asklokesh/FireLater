import { Pool } from 'pg';

export async function migration018Integrations(pool: Pool): Promise<void> {
  await pool.query(`
    -- ============================================
    -- INTEGRATIONS & WEBHOOKS MODULE
    -- ============================================
    -- Enables external integrations, webhooks, and API key management

    SET search_path TO tenant_template;

    -- ============================================
    -- API KEYS TABLE
    -- ============================================

    CREATE TABLE IF NOT EXISTS api_keys (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(100) NOT NULL,
        description         TEXT,
        key_prefix          VARCHAR(20) NOT NULL,  -- First part of key for display (e.g., "fl_live_abc...")
        key_hash            VARCHAR(255) NOT NULL, -- Hashed full key
        permissions         JSONB DEFAULT '[]',    -- Array of allowed permissions
        rate_limit          INTEGER DEFAULT 1000,  -- Requests per hour
        is_active           BOOLEAN DEFAULT true,
        expires_at          TIMESTAMPTZ,
        last_used_at        TIMESTAMPTZ,
        usage_count         INTEGER DEFAULT 0,
        ip_whitelist        JSONB DEFAULT '[]',    -- Array of allowed IPs (empty = all)

        created_by          UUID REFERENCES users(id),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);

    -- ============================================
    -- WEBHOOKS TABLE
    -- ============================================

    CREATE TABLE IF NOT EXISTS webhooks (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(100) NOT NULL,
        description         TEXT,
        url                 VARCHAR(2048) NOT NULL,
        secret              VARCHAR(255),          -- For signing payloads (HMAC)

        -- Events to trigger webhook
        events              JSONB DEFAULT '[]',    -- e.g., ["issue.created", "issue.updated"]

        -- Filtering
        filters             JSONB DEFAULT '{}',    -- e.g., { "priority": ["high", "critical"] }

        -- Configuration
        is_active           BOOLEAN DEFAULT true,
        retry_count         INTEGER DEFAULT 3,
        retry_delay         INTEGER DEFAULT 60,    -- Seconds between retries
        timeout             INTEGER DEFAULT 30,    -- Request timeout in seconds

        -- Headers to include
        custom_headers      JSONB DEFAULT '{}',

        -- Statistics
        last_triggered_at   TIMESTAMPTZ,
        success_count       INTEGER DEFAULT 0,
        failure_count       INTEGER DEFAULT 0,

        created_by          UUID REFERENCES users(id),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING GIN (events);

    -- ============================================
    -- WEBHOOK DELIVERIES TABLE (Log)
    -- ============================================

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id          UUID REFERENCES webhooks(id) ON DELETE SET NULL,
        event               VARCHAR(100) NOT NULL,
        payload             JSONB NOT NULL,

        -- Delivery status
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, success, failed
        response_status     INTEGER,
        response_body       TEXT,
        response_headers    JSONB,

        -- Timing
        attempt_count       INTEGER DEFAULT 0,
        next_retry_at       TIMESTAMPTZ,
        delivered_at        TIMESTAMPTZ,

        -- Error info
        error_message       TEXT,

        created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries(next_retry_at) WHERE status = 'pending';

    -- ============================================
    -- INTEGRATIONS TABLE
    -- ============================================

    CREATE TABLE IF NOT EXISTS integrations (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(100) NOT NULL,
        type                VARCHAR(50) NOT NULL,  -- slack, teams, jira, servicenow, pagerduty, etc.
        description         TEXT,

        -- Connection details (encrypted in application)
        config              JSONB DEFAULT '{}',
        credentials         JSONB DEFAULT '{}',    -- Encrypted credentials

        -- Status
        is_active           BOOLEAN DEFAULT true,
        connection_status   VARCHAR(20) DEFAULT 'pending', -- pending, connected, failed
        last_sync_at        TIMESTAMPTZ,
        last_error          TEXT,

        -- Sync settings
        sync_enabled        BOOLEAN DEFAULT false,
        sync_interval       INTEGER DEFAULT 60,    -- Minutes
        sync_direction      VARCHAR(20) DEFAULT 'both', -- inbound, outbound, both

        -- Field mappings
        field_mappings      JSONB DEFAULT '{}',

        created_by          UUID REFERENCES users(id),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);
    CREATE INDEX IF NOT EXISTS idx_integrations_active ON integrations(is_active) WHERE is_active = true;

    -- ============================================
    -- INTEGRATION SYNC LOG
    -- ============================================

    CREATE TABLE IF NOT EXISTS integration_sync_logs (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id      UUID REFERENCES integrations(id) ON DELETE CASCADE,
        direction           VARCHAR(20) NOT NULL,  -- inbound, outbound
        entity_type         VARCHAR(50) NOT NULL,  -- issue, change, etc.
        entity_id           UUID,
        external_id         VARCHAR(255),

        action              VARCHAR(20) NOT NULL,  -- create, update, delete
        status              VARCHAR(20) NOT NULL,  -- success, failed
        error_message       TEXT,
        payload             JSONB,
        response            JSONB,

        created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_integration_sync_integration ON integration_sync_logs(integration_id);
    CREATE INDEX IF NOT EXISTS idx_integration_sync_entity ON integration_sync_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_integration_sync_created ON integration_sync_logs(created_at DESC);

    -- ============================================
    -- INTEGRATION PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('api_keys', 'create', 'Create API keys'),
        ('api_keys', 'read', 'View API keys'),
        ('api_keys', 'update', 'Update API keys'),
        ('api_keys', 'delete', 'Delete API keys'),
        ('webhooks', 'create', 'Create webhooks'),
        ('webhooks', 'read', 'View webhooks'),
        ('webhooks', 'update', 'Update webhooks'),
        ('webhooks', 'delete', 'Delete webhooks'),
        ('integrations', 'create', 'Create integrations'),
        ('integrations', 'read', 'View integrations'),
        ('integrations', 'update', 'Update integrations'),
        ('integrations', 'delete', 'Delete integrations')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Grant permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('api_keys', 'webhooks', 'integrations')
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

        -- API Keys
        CREATE TABLE IF NOT EXISTS api_keys (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                VARCHAR(100) NOT NULL,
            description         TEXT,
            key_prefix          VARCHAR(20) NOT NULL,
            key_hash            VARCHAR(255) NOT NULL,
            permissions         JSONB DEFAULT '[]',
            rate_limit          INTEGER DEFAULT 1000,
            is_active           BOOLEAN DEFAULT true,
            expires_at          TIMESTAMPTZ,
            last_used_at        TIMESTAMPTZ,
            usage_count         INTEGER DEFAULT 0,
            ip_whitelist        JSONB DEFAULT '[]',
            created_by          UUID REFERENCES users(id),
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
        CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

        -- Webhooks
        CREATE TABLE IF NOT EXISTS webhooks (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                VARCHAR(100) NOT NULL,
            description         TEXT,
            url                 VARCHAR(2048) NOT NULL,
            secret              VARCHAR(255),
            events              JSONB DEFAULT '[]',
            filters             JSONB DEFAULT '{}',
            is_active           BOOLEAN DEFAULT true,
            retry_count         INTEGER DEFAULT 3,
            retry_delay         INTEGER DEFAULT 60,
            timeout             INTEGER DEFAULT 30,
            custom_headers      JSONB DEFAULT '{}',
            last_triggered_at   TIMESTAMPTZ,
            success_count       INTEGER DEFAULT 0,
            failure_count       INTEGER DEFAULT 0,
            created_by          UUID REFERENCES users(id),
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;
        CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING GIN (events);

        -- Webhook Deliveries
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            webhook_id          UUID REFERENCES webhooks(id) ON DELETE SET NULL,
            event               VARCHAR(100) NOT NULL,
            payload             JSONB NOT NULL,
            status              VARCHAR(20) NOT NULL DEFAULT 'pending',
            response_status     INTEGER,
            response_body       TEXT,
            response_headers    JSONB,
            attempt_count       INTEGER DEFAULT 0,
            next_retry_at       TIMESTAMPTZ,
            delivered_at        TIMESTAMPTZ,
            error_message       TEXT,
            created_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

        -- Integrations
        CREATE TABLE IF NOT EXISTS integrations (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                VARCHAR(100) NOT NULL,
            type                VARCHAR(50) NOT NULL,
            description         TEXT,
            config              JSONB DEFAULT '{}',
            credentials         JSONB DEFAULT '{}',
            is_active           BOOLEAN DEFAULT true,
            connection_status   VARCHAR(20) DEFAULT 'pending',
            last_sync_at        TIMESTAMPTZ,
            last_error          TEXT,
            sync_enabled        BOOLEAN DEFAULT false,
            sync_interval       INTEGER DEFAULT 60,
            sync_direction      VARCHAR(20) DEFAULT 'both',
            field_mappings      JSONB DEFAULT '{}',
            created_by          UUID REFERENCES users(id),
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);
        CREATE INDEX IF NOT EXISTS idx_integrations_active ON integrations(is_active) WHERE is_active = true;

        -- Integration Sync Logs
        CREATE TABLE IF NOT EXISTS integration_sync_logs (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            integration_id      UUID REFERENCES integrations(id) ON DELETE CASCADE,
            direction           VARCHAR(20) NOT NULL,
            entity_type         VARCHAR(50) NOT NULL,
            entity_id           UUID,
            external_id         VARCHAR(255),
            action              VARCHAR(20) NOT NULL,
            status              VARCHAR(20) NOT NULL,
            error_message       TEXT,
            payload             JSONB,
            response            JSONB,
            created_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_integration_sync_integration ON integration_sync_logs(integration_id);
        CREATE INDEX IF NOT EXISTS idx_integration_sync_created ON integration_sync_logs(created_at DESC);

        -- Add permissions
        INSERT INTO permissions (resource, action, description) VALUES
            ('api_keys', 'create', 'Create API keys'),
            ('api_keys', 'read', 'View API keys'),
            ('api_keys', 'update', 'Update API keys'),
            ('api_keys', 'delete', 'Delete API keys'),
            ('webhooks', 'create', 'Create webhooks'),
            ('webhooks', 'read', 'View webhooks'),
            ('webhooks', 'update', 'Update webhooks'),
            ('webhooks', 'delete', 'Delete webhooks'),
            ('integrations', 'create', 'Create integrations'),
            ('integrations', 'read', 'View integrations'),
            ('integrations', 'update', 'Update integrations'),
            ('integrations', 'delete', 'Delete integrations')
        ON CONFLICT (resource, action) DO NOTHING;

        -- Grant permissions to admin role
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'admin'
        AND p.resource IN ('api_keys', 'webhooks', 'integrations')
        ON CONFLICT DO NOTHING;

        RESET search_path;
      `);
    } catch (err) {
      console.error(`Failed to apply integrations migration to tenant ${tenant.slug}:`, err);
    }
  }
}
