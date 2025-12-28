import { Pool } from 'pg';

export async function migration008Reporting(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- ============================================
    -- REPORT TEMPLATES
    -- ============================================

    CREATE TABLE report_templates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        report_type     VARCHAR(50) NOT NULL,

        -- Configuration
        query_config    JSONB NOT NULL DEFAULT '{}',
        filters         JSONB DEFAULT '{}',
        groupings       JSONB DEFAULT '[]',
        metrics         JSONB DEFAULT '[]',
        chart_config    JSONB DEFAULT '{}',

        -- Output
        output_format   VARCHAR(20) DEFAULT 'json',
        include_charts  BOOLEAN DEFAULT true,

        -- Access control
        is_public       BOOLEAN DEFAULT false,
        created_by      UUID REFERENCES users(id) ON DELETE SET NULL,

        -- Status
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_report_templates_type ON report_templates(report_type);
    CREATE INDEX idx_report_templates_creator ON report_templates(created_by);

    -- ============================================
    -- SCHEDULED REPORTS
    -- ============================================

    CREATE TABLE scheduled_reports (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id     UUID REFERENCES report_templates(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,

        -- Schedule configuration
        schedule_type   VARCHAR(20) NOT NULL,
        cron_expression VARCHAR(100),
        timezone        VARCHAR(100) DEFAULT 'UTC',

        -- Delivery configuration
        delivery_method VARCHAR(50) NOT NULL,
        recipients      JSONB NOT NULL DEFAULT '[]',
        email_subject   VARCHAR(500),
        email_body      TEXT,
        webhook_url     TEXT,
        slack_channel   VARCHAR(255),

        -- Output configuration
        output_format   VARCHAR(20) DEFAULT 'pdf',

        -- Custom filters (override template)
        custom_filters  JSONB DEFAULT '{}',
        date_range_type VARCHAR(50) DEFAULT 'last_30_days',

        -- Execution tracking
        last_run_at     TIMESTAMPTZ,
        last_run_status VARCHAR(50),
        last_run_error  TEXT,
        next_run_at     TIMESTAMPTZ,

        -- Status
        is_active       BOOLEAN DEFAULT true,
        created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_scheduled_reports_template ON scheduled_reports(template_id);
    CREATE INDEX idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE is_active = true;

    -- ============================================
    -- REPORT EXECUTIONS
    -- ============================================

    CREATE TABLE report_executions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id     UUID REFERENCES report_templates(id) ON DELETE SET NULL,
        scheduled_id    UUID REFERENCES scheduled_reports(id) ON DELETE SET NULL,

        -- Execution details
        report_type     VARCHAR(50) NOT NULL,
        filters_used    JSONB DEFAULT '{}',
        date_range_start TIMESTAMPTZ,
        date_range_end  TIMESTAMPTZ,

        -- Output
        output_format   VARCHAR(20) NOT NULL,
        file_path       TEXT,
        file_size       INTEGER,
        row_count       INTEGER,

        -- Execution status
        status          VARCHAR(50) NOT NULL DEFAULT 'pending',
        started_at      TIMESTAMPTZ,
        completed_at    TIMESTAMPTZ,
        error_message   TEXT,

        -- Delivery
        delivered       BOOLEAN DEFAULT false,
        delivered_at    TIMESTAMPTZ,
        delivery_error  TEXT,

        -- Audit
        executed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_report_executions_template ON report_executions(template_id);
    CREATE INDEX idx_report_executions_scheduled ON report_executions(scheduled_id);
    CREATE INDEX idx_report_executions_status ON report_executions(status);
    CREATE INDEX idx_report_executions_created ON report_executions(created_at DESC);

    -- ============================================
    -- SAVED REPORTS (for user bookmarks)
    -- ============================================

    CREATE TABLE saved_reports (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,

        -- Report configuration
        report_type     VARCHAR(50) NOT NULL,
        filters         JSONB DEFAULT '{}',
        groupings       JSONB DEFAULT '[]',
        date_range_type VARCHAR(50) DEFAULT 'last_30_days',
        custom_start    TIMESTAMPTZ,
        custom_end      TIMESTAMPTZ,

        -- Display preferences
        chart_type      VARCHAR(50),
        sort_by         VARCHAR(100),
        sort_order      VARCHAR(10) DEFAULT 'desc',

        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_saved_reports_user ON saved_reports(user_id);

    -- ============================================
    -- DASHBOARD WIDGETS
    -- ============================================

    CREATE TABLE dashboard_widgets (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,

        -- Widget configuration
        widget_type     VARCHAR(50) NOT NULL,
        title           VARCHAR(255),
        position_x      INTEGER DEFAULT 0,
        position_y      INTEGER DEFAULT 0,
        width           INTEGER DEFAULT 4,
        height          INTEGER DEFAULT 3,

        -- Data configuration
        data_source     VARCHAR(100) NOT NULL,
        filters         JSONB DEFAULT '{}',
        refresh_interval INTEGER DEFAULT 300,

        -- Display configuration
        chart_type      VARCHAR(50),
        chart_config    JSONB DEFAULT '{}',
        color_scheme    VARCHAR(50),
        show_legend     BOOLEAN DEFAULT true,

        -- Status
        is_visible      BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_dashboard_widgets_user ON dashboard_widgets(user_id);

    -- ============================================
    -- ANALYTICS CACHE
    -- ============================================

    CREATE TABLE analytics_cache (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cache_key       VARCHAR(500) NOT NULL,
        data_type       VARCHAR(50) NOT NULL,

        -- Cached data
        cached_data     JSONB NOT NULL,

        -- Validity
        computed_at     TIMESTAMPTZ DEFAULT NOW(),
        expires_at      TIMESTAMPTZ NOT NULL,

        UNIQUE(cache_key)
    );

    CREATE INDEX idx_analytics_cache_key ON analytics_cache(cache_key);
    CREATE INDEX idx_analytics_cache_expires ON analytics_cache(expires_at);

    -- ============================================
    -- DEFAULT REPORT TEMPLATES
    -- ============================================

    INSERT INTO report_templates (name, description, report_type, query_config, metrics, is_public) VALUES
        ('Issue Summary', 'Summary of issues by status and priority', 'issues',
         '{"entity": "issues", "aggregations": ["status", "priority"]}',
         '["total", "by_status", "by_priority", "mttr"]',
         true),
        ('Change Success Rate', 'Change request success and failure rates', 'changes',
         '{"entity": "changes", "aggregations": ["outcome", "risk_level"]}',
         '["total", "success_rate", "failure_rate", "by_risk"]',
         true),
        ('SLA Compliance', 'SLA compliance metrics by priority', 'sla',
         '{"entity": "issues", "aggregations": ["priority", "sla_status"]}',
         '["compliance_rate", "breaches", "by_priority"]',
         true),
        ('Health Score Trend', 'Application health score trends over time', 'health',
         '{"entity": "health_scores", "aggregations": ["tier", "trend"]}',
         '["average_score", "by_tier", "trend_data"]',
         true),
        ('Request Volume', 'Service request volume and completion rates', 'requests',
         '{"entity": "requests", "aggregations": ["status", "catalog_item"]}',
         '["total", "completion_rate", "avg_resolution_time"]',
         true),
        ('On-Call Coverage', 'On-call coverage and escalation metrics', 'oncall',
         '{"entity": "oncall", "aggregations": ["schedule", "escalations"]}',
         '["coverage_hours", "escalation_count", "response_time"]',
         true),
        ('Cloud Cost Summary', 'Cloud costs by account and service', 'cloud_costs',
         '{"entity": "cloud_costs", "aggregations": ["provider", "service"]}',
         '["total_cost", "by_provider", "by_service", "trend"]',
         true),
        ('Application Portfolio', 'Overview of all applications by tier and status', 'applications',
         '{"entity": "applications", "aggregations": ["tier", "status", "lifecycle"]}',
         '["total", "by_tier", "by_status", "health_distribution"]',
         true);

    -- ============================================
    -- PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('reports', 'read', 'View reports and dashboards'),
        ('reports', 'create', 'Create reports'),
        ('reports', 'manage', 'Manage report templates and schedules'),
        ('reports', 'export', 'Export reports to PDF/Excel'),
        ('dashboards', 'read', 'View dashboards'),
        ('dashboards', 'manage', 'Manage dashboard widgets')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Assign to admin
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('reports', 'dashboards')
    ON CONFLICT DO NOTHING;

    -- Assign read/create permissions to manager
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND ((p.resource = 'reports' AND p.action IN ('read', 'create', 'export'))
         OR (p.resource = 'dashboards' AND p.action IN ('read', 'manage')))
    ON CONFLICT DO NOTHING;

    -- Assign read permissions to agent
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND ((p.resource = 'reports' AND p.action = 'read')
         OR (p.resource = 'dashboards' AND p.action = 'read'))
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);
}
