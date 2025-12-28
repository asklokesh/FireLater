import { Pool } from 'pg';

export async function migration007HealthCloud(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- ============================================
    -- APPLICATION HEALTH SCORING
    -- ============================================

    CREATE TABLE app_health_scores (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
        calculated_at   TIMESTAMPTZ DEFAULT NOW(),
        overall_score   DECIMAL(5,2) NOT NULL,

        -- Component scores (all 0-100)
        issue_score     DECIMAL(5,2),
        change_score    DECIMAL(5,2),
        sla_score       DECIMAL(5,2),
        uptime_score    DECIMAL(5,2),

        -- Component weights used
        issue_weight    DECIMAL(3,2) DEFAULT 0.40,
        change_weight   DECIMAL(3,2) DEFAULT 0.25,
        sla_weight      DECIMAL(3,2) DEFAULT 0.25,
        uptime_weight   DECIMAL(3,2) DEFAULT 0.10,

        -- Raw metrics used in calculation
        issues_30d      INTEGER DEFAULT 0,
        critical_issues_30d INTEGER DEFAULT 0,
        high_issues_30d INTEGER DEFAULT 0,
        total_changes_30d INTEGER DEFAULT 0,
        failed_changes_30d INTEGER DEFAULT 0,
        rolled_back_changes_30d INTEGER DEFAULT 0,
        sla_breaches_30d INTEGER DEFAULT 0,
        total_sla_tracked_30d INTEGER DEFAULT 0,
        uptime_percent_30d DECIMAL(5,2),

        -- Tier-adjusted multiplier
        tier            VARCHAR(10),
        tier_weight     DECIMAL(3,2),

        -- Score trend
        score_change    DECIMAL(5,2),
        trend           VARCHAR(20),

        metadata        JSONB DEFAULT '{}'
    );

    CREATE INDEX idx_health_scores_app_time ON app_health_scores(application_id, calculated_at DESC);
    CREATE INDEX idx_health_scores_score ON app_health_scores(overall_score);

    -- Health score configuration per tier
    CREATE TABLE health_score_config (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tier            VARCHAR(10) NOT NULL UNIQUE,
        tier_weight     DECIMAL(3,2) NOT NULL,

        -- Thresholds for score bands
        critical_threshold INTEGER DEFAULT 50,
        warning_threshold INTEGER DEFAULT 75,
        good_threshold INTEGER DEFAULT 90,

        -- Issue penalties
        critical_issue_penalty INTEGER DEFAULT 15,
        high_issue_penalty INTEGER DEFAULT 8,
        medium_issue_penalty INTEGER DEFAULT 3,
        low_issue_penalty INTEGER DEFAULT 1,

        -- Weights (should sum to 1.0)
        issue_weight    DECIMAL(3,2) DEFAULT 0.40,
        change_weight   DECIMAL(3,2) DEFAULT 0.25,
        sla_weight      DECIMAL(3,2) DEFAULT 0.25,
        uptime_weight   DECIMAL(3,2) DEFAULT 0.10,

        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- Default configuration
    INSERT INTO health_score_config (tier, tier_weight) VALUES
        ('P1', 1.5),
        ('P2', 1.2),
        ('P3', 1.0),
        ('P4', 0.8);

    -- ============================================
    -- CLOUD INTEGRATIONS
    -- ============================================

    CREATE TABLE cloud_accounts (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider        VARCHAR(50) NOT NULL,
        account_id      VARCHAR(255) NOT NULL,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,

        -- Credentials (encrypted at application level)
        credential_type VARCHAR(50) NOT NULL,
        credentials     JSONB,
        role_arn        TEXT,
        external_id     VARCHAR(255),

        -- Sync configuration
        sync_enabled    BOOLEAN DEFAULT true,
        sync_interval   INTEGER DEFAULT 3600,
        sync_resources  BOOLEAN DEFAULT true,
        sync_costs      BOOLEAN DEFAULT true,
        sync_metrics    BOOLEAN DEFAULT false,
        regions         TEXT[],

        -- Sync status
        last_sync_at    TIMESTAMPTZ,
        last_sync_status VARCHAR(50),
        last_sync_error TEXT,
        next_sync_at    TIMESTAMPTZ,

        status          VARCHAR(50) DEFAULT 'active',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(provider, account_id)
    );

    CREATE INDEX idx_cloud_accounts_provider ON cloud_accounts(provider);
    CREATE INDEX idx_cloud_accounts_status ON cloud_accounts(status);

    CREATE TABLE cloud_resources (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
        resource_id     VARCHAR(500) NOT NULL,
        resource_type   VARCHAR(100) NOT NULL,
        name            VARCHAR(255),
        region          VARCHAR(50),
        availability_zone VARCHAR(50),
        status          VARCHAR(50),

        -- Resource details
        tags            JSONB DEFAULT '{}',
        metadata        JSONB DEFAULT '{}',
        configuration   JSONB DEFAULT '{}',

        -- Link to application
        application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
        environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,
        auto_mapped     BOOLEAN DEFAULT false,

        -- Cost tracking
        hourly_cost     DECIMAL(12,4),
        monthly_cost    DECIMAL(12,2),
        cost_updated_at TIMESTAMPTZ,

        -- Lifecycle
        first_seen      TIMESTAMPTZ DEFAULT NOW(),
        last_seen       TIMESTAMPTZ DEFAULT NOW(),
        is_deleted      BOOLEAN DEFAULT false,
        deleted_at      TIMESTAMPTZ,

        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(cloud_account_id, resource_id)
    );

    CREATE INDEX idx_cloud_resources_account ON cloud_resources(cloud_account_id);
    CREATE INDEX idx_cloud_resources_type ON cloud_resources(resource_type);
    CREATE INDEX idx_cloud_resources_application ON cloud_resources(application_id);
    CREATE INDEX idx_cloud_resources_environment ON cloud_resources(environment_id);
    CREATE INDEX idx_cloud_resources_last_seen ON cloud_resources(last_seen);

    -- Cost reports
    CREATE TABLE cloud_cost_reports (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
        application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
        environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,

        period_type     VARCHAR(20) NOT NULL,
        period_start    DATE NOT NULL,
        period_end      DATE NOT NULL,

        total_cost      DECIMAL(12,2) NOT NULL,
        currency        VARCHAR(10) DEFAULT 'USD',

        -- Breakdowns
        cost_by_service JSONB DEFAULT '{}',
        cost_by_region  JSONB DEFAULT '{}',
        cost_by_resource_type JSONB DEFAULT '{}',

        -- Comparison
        previous_period_cost DECIMAL(12,2),
        cost_change_percent DECIMAL(5,2),

        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(cloud_account_id, application_id, period_type, period_start)
    );

    CREATE INDEX idx_cloud_costs_account ON cloud_cost_reports(cloud_account_id);
    CREATE INDEX idx_cloud_costs_application ON cloud_cost_reports(application_id);
    CREATE INDEX idx_cloud_costs_period ON cloud_cost_reports(period_start, period_end);

    -- Cloud metrics
    CREATE TABLE cloud_metrics (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
        resource_id     VARCHAR(500),
        application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,

        metric_name     VARCHAR(100) NOT NULL,
        metric_namespace VARCHAR(100),

        timestamp       TIMESTAMPTZ NOT NULL,
        value           DECIMAL(20,6) NOT NULL,
        unit            VARCHAR(50),

        dimensions      JSONB DEFAULT '{}',

        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_cloud_metrics_time ON cloud_metrics(timestamp DESC);
    CREATE INDEX idx_cloud_metrics_app ON cloud_metrics(application_id, metric_name, timestamp DESC);

    -- Auto-mapping rules
    CREATE TABLE cloud_resource_mapping_rules (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        priority        INTEGER DEFAULT 100,

        -- Matching criteria
        provider        VARCHAR(50),
        resource_type   VARCHAR(100),
        tag_key         VARCHAR(255) NOT NULL,
        tag_value_pattern VARCHAR(255),

        -- Target
        application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
        environment_type VARCHAR(50),

        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_mapping_rules_priority ON cloud_resource_mapping_rules(priority);

    -- ============================================
    -- PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('health_scores', 'read', 'View application health scores'),
        ('health_scores', 'manage', 'Manage health score configuration'),
        ('cloud_accounts', 'read', 'View cloud accounts'),
        ('cloud_accounts', 'manage', 'Manage cloud accounts'),
        ('cloud_resources', 'read', 'View cloud resources'),
        ('cloud_resources', 'manage', 'Manage cloud resource mappings'),
        ('cloud_costs', 'read', 'View cloud costs')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Assign to admin
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('health_scores', 'cloud_accounts', 'cloud_resources', 'cloud_costs')
    ON CONFLICT DO NOTHING;

    -- Assign read permissions to manager
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND ((p.resource = 'health_scores' AND p.action = 'read')
         OR (p.resource = 'cloud_accounts' AND p.action = 'read')
         OR (p.resource = 'cloud_resources' AND p.action = 'read')
         OR (p.resource = 'cloud_costs' AND p.action = 'read'))
    ON CONFLICT DO NOTHING;

    -- Assign read permissions to agent
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND p.resource = 'health_scores' AND p.action = 'read'
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);
}
