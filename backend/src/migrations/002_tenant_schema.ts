import { Pool } from 'pg';

export async function migration002TenantSchema(pool: Pool): Promise<void> {
  // Create the template schema that will be cloned for each tenant
  await pool.query(`
    -- ============================================
    -- TENANT TEMPLATE SCHEMA (Cloned per tenant)
    -- ============================================

    DROP SCHEMA IF EXISTS tenant_template CASCADE;
    CREATE SCHEMA tenant_template;

    SET search_path TO tenant_template;

    -- ============================================
    -- SEQUENCE COUNTERS (for human-readable IDs)
    -- ============================================

    CREATE TABLE id_sequences (
        entity_type     VARCHAR(50) PRIMARY KEY,
        prefix          VARCHAR(10) NOT NULL,
        current_value   BIGINT DEFAULT 0,
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO id_sequences (entity_type, prefix, current_value) VALUES
        ('request', 'REQ', 0),
        ('issue', 'ISS', 0),
        ('change', 'CHG', 0),
        ('task', 'TSK', 0),
        ('application', 'APP', 0);

    CREATE OR REPLACE FUNCTION next_id(p_entity_type VARCHAR(50))
    RETURNS VARCHAR(50) AS $$
    DECLARE
        v_prefix VARCHAR(10);
        v_next BIGINT;
    BEGIN
        UPDATE id_sequences
        SET current_value = current_value + 1, updated_at = NOW()
        WHERE entity_type = p_entity_type
        RETURNING prefix, current_value INTO v_prefix, v_next;

        RETURN v_prefix || '-' || LPAD(v_next::TEXT, 5, '0');
    END;
    $$ LANGUAGE plpgsql;

    -- ============================================
    -- IDENTITY & ACCESS
    -- ============================================

    CREATE TABLE users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           VARCHAR(255) NOT NULL UNIQUE,
        name            VARCHAR(255) NOT NULL,
        avatar_url      TEXT,
        phone           VARCHAR(50),
        timezone        VARCHAR(100) DEFAULT 'UTC',
        status          VARCHAR(20) DEFAULT 'active',
        auth_provider   VARCHAR(50) DEFAULT 'local',
        external_id     VARCHAR(255),
        password_hash   TEXT,
        last_login_at   TIMESTAMPTZ,
        settings        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_users_status ON users(status);
    CREATE INDEX idx_users_external_id ON users(auth_provider, external_id) WHERE external_id IS NOT NULL;

    -- ============================================
    -- ROLES & PERMISSIONS (RBAC)
    -- ============================================

    CREATE TABLE roles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(100) NOT NULL UNIQUE,
        display_name    VARCHAR(255) NOT NULL,
        description     TEXT,
        is_system       BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE permissions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        resource        VARCHAR(100) NOT NULL,
        action          VARCHAR(50) NOT NULL,
        description     TEXT,
        UNIQUE(resource, action)
    );

    CREATE TABLE role_permissions (
        role_id         UUID REFERENCES roles(id) ON DELETE CASCADE,
        permission_id   UUID REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE user_roles (
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        role_id         UUID REFERENCES roles(id) ON DELETE CASCADE,
        granted_by      UUID REFERENCES users(id),
        granted_at      TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
    );

    -- Insert default roles
    INSERT INTO roles (name, display_name, description, is_system) VALUES
        ('admin', 'Administrator', 'Full system access', true),
        ('manager', 'Manager', 'Manage team and approve changes', true),
        ('agent', 'Agent', 'Handle issues and requests', true),
        ('requester', 'Requester', 'Submit and view own requests', true);

    -- Insert default permissions
    INSERT INTO permissions (resource, action, description) VALUES
        ('users', 'create', 'Create users'),
        ('users', 'read', 'View users'),
        ('users', 'update', 'Update users'),
        ('users', 'delete', 'Delete users'),
        ('groups', 'create', 'Create groups'),
        ('groups', 'read', 'View groups'),
        ('groups', 'update', 'Update groups'),
        ('groups', 'delete', 'Delete groups'),
        ('applications', 'create', 'Create applications'),
        ('applications', 'read', 'View applications'),
        ('applications', 'update', 'Update applications'),
        ('applications', 'delete', 'Delete applications'),
        ('issues', 'create', 'Create issues'),
        ('issues', 'read', 'View issues'),
        ('issues', 'update', 'Update issues'),
        ('issues', 'delete', 'Delete issues'),
        ('issues', 'assign', 'Assign issues'),
        ('issues', 'resolve', 'Resolve issues'),
        ('changes', 'create', 'Create change requests'),
        ('changes', 'read', 'View change requests'),
        ('changes', 'update', 'Update change requests'),
        ('changes', 'delete', 'Delete change requests'),
        ('changes', 'approve', 'Approve change requests'),
        ('catalog', 'create', 'Create catalog items'),
        ('catalog', 'read', 'View catalog items'),
        ('catalog', 'update', 'Update catalog items'),
        ('catalog', 'delete', 'Delete catalog items'),
        ('requests', 'create', 'Create service requests'),
        ('requests', 'read', 'View service requests'),
        ('requests', 'update', 'Update service requests'),
        ('requests', 'delete', 'Delete service requests'),
        ('requests', 'approve', 'Approve service requests'),
        ('oncall', 'create', 'Create on-call schedules'),
        ('oncall', 'read', 'View on-call schedules'),
        ('oncall', 'update', 'Update on-call schedules'),
        ('oncall', 'delete', 'Delete on-call schedules'),
        ('reports', 'read', 'View reports'),
        ('audit', 'read', 'View audit logs'),
        ('settings', 'read', 'View tenant settings'),
        ('settings', 'update', 'Update tenant settings');

    -- Assign permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin';

    -- Assign permissions to manager role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND (p.resource, p.action) IN (
        ('users', 'read'), ('groups', 'read'), ('groups', 'update'),
        ('applications', 'read'), ('applications', 'update'),
        ('issues', 'create'), ('issues', 'read'), ('issues', 'update'), ('issues', 'assign'), ('issues', 'resolve'),
        ('changes', 'create'), ('changes', 'read'), ('changes', 'update'), ('changes', 'approve'),
        ('requests', 'read'), ('requests', 'update'), ('requests', 'approve'),
        ('oncall', 'read'), ('oncall', 'update'),
        ('reports', 'read')
    );

    -- Assign permissions to agent role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND (p.resource, p.action) IN (
        ('users', 'read'), ('groups', 'read'),
        ('applications', 'read'),
        ('issues', 'create'), ('issues', 'read'), ('issues', 'update'), ('issues', 'resolve'),
        ('changes', 'read'),
        ('requests', 'read'), ('requests', 'update'),
        ('oncall', 'read'),
        ('catalog', 'read')
    );

    -- Assign permissions to requester role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'requester'
    AND (p.resource, p.action) IN (
        ('issues', 'create'), ('issues', 'read'),
        ('requests', 'create'), ('requests', 'read'),
        ('catalog', 'read'),
        ('applications', 'read')
    );

    -- ============================================
    -- GROUPS
    -- ============================================

    CREATE TABLE groups (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        type            VARCHAR(50) DEFAULT 'team',
        parent_id       UUID REFERENCES groups(id) ON DELETE SET NULL,
        manager_id      UUID REFERENCES users(id) ON DELETE SET NULL,
        email           VARCHAR(255),
        settings        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_groups_parent ON groups(parent_id);
    CREATE INDEX idx_groups_type ON groups(type);
    CREATE INDEX idx_groups_manager ON groups(manager_id);

    CREATE TABLE group_members (
        group_id        UUID REFERENCES groups(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        role            VARCHAR(50) DEFAULT 'member',
        joined_at       TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
    );

    CREATE INDEX idx_group_members_user ON group_members(user_id);

    -- ============================================
    -- APPLICATION REGISTRY
    -- ============================================

    CREATE TABLE applications (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id          VARCHAR(50) NOT NULL UNIQUE,
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        tier            VARCHAR(10) NOT NULL,
        status          VARCHAR(50) DEFAULT 'active',
        lifecycle_stage VARCHAR(50) DEFAULT 'production',
        owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
        owner_group_id  UUID REFERENCES groups(id) ON DELETE SET NULL,
        support_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        business_unit   VARCHAR(255),
        criticality     VARCHAR(50),
        tags            TEXT[],
        metadata        JSONB DEFAULT '{}',
        health_score    DECIMAL(5,2),
        health_score_updated_at TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_applications_app_id ON applications(app_id);
    CREATE INDEX idx_applications_tier ON applications(tier);
    CREATE INDEX idx_applications_status ON applications(status);
    CREATE INDEX idx_applications_owner_user ON applications(owner_user_id);
    CREATE INDEX idx_applications_owner_group ON applications(owner_group_id);
    CREATE INDEX idx_applications_support_group ON applications(support_group_id);

    CREATE TABLE environments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
        name            VARCHAR(100) NOT NULL,
        type            VARCHAR(50) NOT NULL,
        url             TEXT,
        cloud_provider  VARCHAR(50),
        cloud_account   VARCHAR(255),
        cloud_region    VARCHAR(50),
        resource_ids    JSONB DEFAULT '[]',
        status          VARCHAR(50) DEFAULT 'active',
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(application_id, name)
    );

    CREATE INDEX idx_environments_application ON environments(application_id);
    CREATE INDEX idx_environments_type ON environments(type);

    -- ============================================
    -- SLA CONFIGURATION
    -- ============================================

    CREATE TABLE sla_policies (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        entity_type     VARCHAR(50) NOT NULL,
        is_default      BOOLEAN DEFAULT false,
        conditions      JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE sla_targets (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id       UUID REFERENCES sla_policies(id) ON DELETE CASCADE,
        metric_type     VARCHAR(50) NOT NULL,
        priority        VARCHAR(20) NOT NULL,
        target_minutes  INTEGER NOT NULL,
        warning_percent INTEGER DEFAULT 80,
        business_hours_only BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(policy_id, metric_type, priority)
    );

    CREATE TABLE business_hours (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL DEFAULT 'Default',
        timezone        VARCHAR(100) NOT NULL DEFAULT 'UTC',
        is_default      BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE business_hours_schedule (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_hours_id UUID REFERENCES business_hours(id) ON DELETE CASCADE,
        day_of_week     INTEGER NOT NULL,
        start_time      TIME NOT NULL,
        end_time        TIME NOT NULL,
        UNIQUE(business_hours_id, day_of_week)
    );

    CREATE TABLE business_hours_holidays (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_hours_id UUID REFERENCES business_hours(id) ON DELETE CASCADE,
        holiday_date    DATE NOT NULL,
        name            VARCHAR(255),
        UNIQUE(business_hours_id, holiday_date)
    );

    -- Insert default business hours (Mon-Fri 9-5)
    INSERT INTO business_hours (name, timezone, is_default) VALUES ('Default Business Hours', 'UTC', true);

    INSERT INTO business_hours_schedule (business_hours_id, day_of_week, start_time, end_time)
    SELECT bh.id, day, '09:00', '17:00'
    FROM business_hours bh, generate_series(1, 5) AS day
    WHERE bh.is_default = true;

    -- Insert default SLA policy for issues
    INSERT INTO sla_policies (name, description, entity_type, is_default) VALUES
        ('Default Issue SLA', 'Default SLA policy for issues', 'issue', true);

    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'response_time', 'critical', 15, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue'
    UNION ALL
    SELECT sp.id, 'response_time', 'high', 60, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue'
    UNION ALL
    SELECT sp.id, 'response_time', 'medium', 240, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue'
    UNION ALL
    SELECT sp.id, 'response_time', 'low', 480, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue'
    UNION ALL
    SELECT sp.id, 'resolution_time', 'critical', 240, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue'
    UNION ALL
    SELECT sp.id, 'resolution_time', 'high', 480, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue'
    UNION ALL
    SELECT sp.id, 'resolution_time', 'medium', 1440, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue'
    UNION ALL
    SELECT sp.id, 'resolution_time', 'low', 2880, 80 FROM sla_policies sp WHERE sp.is_default = true AND sp.entity_type = 'issue';

    -- ============================================
    -- ISSUE MANAGEMENT
    -- ============================================

    CREATE TABLE issue_categories (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        parent_id       UUID REFERENCES issue_categories(id) ON DELETE SET NULL,
        sort_order      INTEGER DEFAULT 0,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_issue_categories_parent ON issue_categories(parent_id);

    CREATE TABLE issues (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_number    VARCHAR(50) NOT NULL UNIQUE,
        title           VARCHAR(500) NOT NULL,
        description     TEXT,
        status          VARCHAR(50) DEFAULT 'new',
        priority        VARCHAR(20) DEFAULT 'medium',
        severity        VARCHAR(20),
        impact          VARCHAR(50),
        urgency         VARCHAR(50),
        category_id     UUID REFERENCES issue_categories(id),
        issue_type      VARCHAR(50) DEFAULT 'issue',
        source          VARCHAR(50),
        application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
        environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,
        reporter_id     UUID REFERENCES users(id),
        assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_group  UUID REFERENCES groups(id) ON DELETE SET NULL,
        escalation_level INTEGER DEFAULT 0,
        escalated_at    TIMESTAMPTZ,
        escalation_policy_id UUID,
        sla_policy_id   UUID REFERENCES sla_policies(id),
        response_due_at TIMESTAMPTZ,
        resolution_due_at TIMESTAMPTZ,
        first_response_at TIMESTAMPTZ,
        sla_breached    BOOLEAN DEFAULT false,
        sla_breach_type VARCHAR(50),
        resolution_code VARCHAR(100),
        resolution_notes TEXT,
        resolved_at     TIMESTAMPTZ,
        resolved_by     UUID REFERENCES users(id),
        closed_at       TIMESTAMPTZ,
        closed_by       UUID REFERENCES users(id),
        parent_issue_id UUID REFERENCES issues(id),
        related_change_id UUID,
        external_refs   JSONB DEFAULT '[]',
        time_to_first_response INTEGER,
        time_to_resolution INTEGER,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_issues_number ON issues(issue_number);
    CREATE INDEX idx_issues_status ON issues(status);
    CREATE INDEX idx_issues_priority ON issues(priority);
    CREATE INDEX idx_issues_application ON issues(application_id);
    CREATE INDEX idx_issues_assigned_to ON issues(assigned_to);
    CREATE INDEX idx_issues_assigned_group ON issues(assigned_group);
    CREATE INDEX idx_issues_reporter ON issues(reporter_id);
    CREATE INDEX idx_issues_created ON issues(created_at DESC);
    CREATE INDEX idx_issues_sla_breach ON issues(sla_breached) WHERE sla_breached = true;
    CREATE INDEX idx_issues_open ON issues(status) WHERE status NOT IN ('resolved', 'closed');

    CREATE TABLE issue_comments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id        UUID REFERENCES issues(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        content         TEXT NOT NULL,
        content_type    VARCHAR(50) DEFAULT 'text',
        is_internal     BOOLEAN DEFAULT false,
        is_resolution   BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_issue_comments_issue ON issue_comments(issue_id);
    CREATE INDEX idx_issue_comments_created ON issue_comments(created_at);

    CREATE TABLE issue_worklogs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id        UUID REFERENCES issues(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        time_spent      INTEGER NOT NULL,
        work_date       DATE NOT NULL DEFAULT CURRENT_DATE,
        description     TEXT,
        billable        BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_issue_worklogs_issue ON issue_worklogs(issue_id);
    CREATE INDEX idx_issue_worklogs_user ON issue_worklogs(user_id);

    CREATE TABLE issue_status_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id        UUID REFERENCES issues(id) ON DELETE CASCADE,
        from_status     VARCHAR(50),
        to_status       VARCHAR(50) NOT NULL,
        changed_by      UUID REFERENCES users(id),
        reason          TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_issue_status_history_issue ON issue_status_history(issue_id);

    -- ============================================
    -- REFRESH TOKENS
    -- ============================================

    CREATE TABLE refresh_tokens (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash      VARCHAR(255) NOT NULL UNIQUE,
        expires_at      TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        revoked_at      TIMESTAMPTZ
    );

    CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

    -- ============================================
    -- AUDIT LOGS
    -- ============================================

    CREATE TABLE audit_logs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID,
        action          VARCHAR(100) NOT NULL,
        entity_type     VARCHAR(100) NOT NULL,
        entity_id       UUID NOT NULL,
        changes         JSONB,
        ip_address      INET,
        user_agent      TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

    RESET search_path;
  `);
}
