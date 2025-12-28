import { Pool } from 'pg';

export async function migration006Changes(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- ============================================
    -- CHANGE WINDOWS
    -- ============================================

    CREATE TABLE change_windows (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        type            VARCHAR(50) NOT NULL,         -- 'maintenance', 'freeze', 'emergency_only', 'blackout'
        recurrence      VARCHAR(50),                  -- 'one_time', 'weekly', 'monthly', 'custom'
        recurrence_rule TEXT,                         -- iCal RRULE format for complex patterns
        start_time      TIME,
        end_time        TIME,
        start_date      DATE,                         -- For one-time windows
        end_date        DATE,                         -- For one-time windows
        day_of_week     INTEGER[],                    -- For weekly: [0,6] = Sun, Sat
        timezone        VARCHAR(100) DEFAULT 'UTC',
        applications    UUID[],                       -- Specific apps, or NULL for all
        tiers           VARCHAR(10)[],                -- Applicable tiers: ['P1', 'P2']
        status          VARCHAR(50) DEFAULT 'active',
        notify_before_minutes INTEGER DEFAULT 60,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_change_windows_type ON change_windows(type);
    CREATE INDEX idx_change_windows_status ON change_windows(status);

    -- ============================================
    -- CHANGE TEMPLATES
    -- ============================================

    CREATE TABLE change_templates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        type            VARCHAR(50) DEFAULT 'standard', -- 'standard', 'normal'
        category        VARCHAR(100),
        default_risk_level VARCHAR(20) DEFAULT 'low',
        implementation_plan_template TEXT,
        rollback_plan_template TEXT,
        test_plan_template TEXT,
        default_tasks   JSONB DEFAULT '[]',
        approval_required BOOLEAN DEFAULT false,
        approval_groups UUID[],
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- ============================================
    -- CHANGE REQUESTS
    -- ============================================

    CREATE TABLE change_requests (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        change_number   VARCHAR(50) NOT NULL UNIQUE,  -- "CHG-00001"
        title           VARCHAR(500) NOT NULL,
        description     TEXT,
        justification   TEXT,

        -- Classification
        type            VARCHAR(50) DEFAULT 'normal', -- 'standard', 'normal', 'emergency'
        category        VARCHAR(100),
        risk_level      VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
        impact          VARCHAR(50),                  -- 'none', 'minor', 'moderate', 'significant', 'major'
        urgency         VARCHAR(50),                  -- 'low', 'medium', 'high'

        -- Status workflow
        status          VARCHAR(50) DEFAULT 'draft',  -- See workflow below

        -- Relationships
        template_id     UUID REFERENCES change_templates(id),
        application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
        environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,
        requester_id    UUID REFERENCES users(id),
        implementer_id  UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_group  UUID REFERENCES groups(id) ON DELETE SET NULL,

        -- Schedule
        planned_start   TIMESTAMPTZ,
        planned_end     TIMESTAMPTZ,
        actual_start    TIMESTAMPTZ,
        actual_end      TIMESTAMPTZ,
        downtime_minutes INTEGER,

        -- Change window
        change_window_id UUID REFERENCES change_windows(id) ON DELETE SET NULL,

        -- Plans
        implementation_plan TEXT,
        rollback_plan   TEXT,
        test_plan       TEXT,
        communication_plan TEXT,

        -- Risk assessment
        risk_assessment JSONB DEFAULT '{}',

        -- CAB
        cab_required    BOOLEAN DEFAULT false,
        cab_date        TIMESTAMPTZ,
        cab_decision    VARCHAR(50),
        cab_notes       TEXT,

        -- Outcome
        outcome         VARCHAR(50),
        outcome_notes   TEXT,
        post_implementation_review BOOLEAN DEFAULT false,

        -- Related items
        related_issue_id UUID REFERENCES issues(id),
        caused_issue_id UUID REFERENCES issues(id),

        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- Status workflow:
    -- 'draft' -> 'submitted' -> 'review' -> 'approved' -> 'scheduled' -> 'implementing' -> 'completed'
    --                       |            |                                            -> 'failed'
    --                       |            -> 'rejected'                                -> 'rolled_back'
    --                       -> 'cancelled'

    CREATE INDEX idx_changes_number ON change_requests(change_number);
    CREATE INDEX idx_changes_status ON change_requests(status);
    CREATE INDEX idx_changes_type ON change_requests(type);
    CREATE INDEX idx_changes_application ON change_requests(application_id);
    CREATE INDEX idx_changes_requester ON change_requests(requester_id);
    CREATE INDEX idx_changes_planned_start ON change_requests(planned_start);
    CREATE INDEX idx_changes_created ON change_requests(created_at DESC);

    -- ============================================
    -- CHANGE TASKS
    -- ============================================

    CREATE TABLE change_tasks (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        change_id       UUID REFERENCES change_requests(id) ON DELETE CASCADE,
        task_number     VARCHAR(50) NOT NULL,
        title           VARCHAR(500) NOT NULL,
        description     TEXT,
        task_type       VARCHAR(50) DEFAULT 'implementation', -- 'pre_check', 'implementation', 'validation', 'rollback'
        status          VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'skipped', 'failed'
        sort_order      INTEGER DEFAULT 0,
        assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
        planned_start   TIMESTAMPTZ,
        planned_end     TIMESTAMPTZ,
        actual_start    TIMESTAMPTZ,
        actual_end      TIMESTAMPTZ,
        duration_minutes INTEGER,
        is_blocking     BOOLEAN DEFAULT true,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_change_tasks_change ON change_tasks(change_id);
    CREATE INDEX idx_change_tasks_assigned ON change_tasks(assigned_to);
    CREATE INDEX idx_change_tasks_status ON change_tasks(status);

    -- ============================================
    -- CHANGE APPROVALS
    -- ============================================

    CREATE TABLE change_approvals (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        change_id       UUID REFERENCES change_requests(id) ON DELETE CASCADE,
        step_number     INTEGER DEFAULT 1,
        approver_group  UUID REFERENCES groups(id) ON DELETE SET NULL,
        approver_id     UUID REFERENCES users(id),
        status          VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
        decision_at     TIMESTAMPTZ,
        comments        TEXT,
        required        BOOLEAN DEFAULT true,
        delegated_from  UUID REFERENCES users(id),
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_change_approvals_change ON change_approvals(change_id);
    CREATE INDEX idx_change_approvals_status ON change_approvals(status);

    -- ============================================
    -- CHANGE STATUS HISTORY
    -- ============================================

    CREATE TABLE change_status_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        change_id       UUID REFERENCES change_requests(id) ON DELETE CASCADE,
        from_status     VARCHAR(50),
        to_status       VARCHAR(50) NOT NULL,
        changed_by      UUID REFERENCES users(id),
        reason          TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_change_status_history_change ON change_status_history(change_id);

    -- ============================================
    -- CHANGE COMMENTS
    -- ============================================

    CREATE TABLE change_comments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        change_id       UUID REFERENCES change_requests(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        content         TEXT NOT NULL,
        is_internal     BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_change_comments_change ON change_comments(change_id);

    -- ============================================
    -- CHANGE MANAGEMENT PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('changes', 'read', 'View change requests'),
        ('changes', 'create', 'Create change requests'),
        ('changes', 'update', 'Update change requests'),
        ('changes', 'delete', 'Cancel/delete change requests'),
        ('changes', 'approve', 'Approve change requests'),
        ('changes', 'implement', 'Start/complete change implementation'),
        ('change_windows', 'manage', 'Manage change windows'),
        ('change_templates', 'manage', 'Manage change templates')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Assign to admin
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('changes', 'change_windows', 'change_templates')
    ON CONFLICT DO NOTHING;

    -- Assign basic change permissions to manager
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND ((p.resource = 'changes' AND p.action IN ('read', 'create', 'update', 'approve'))
         OR (p.resource = 'change_windows' AND p.action = 'manage')
         OR (p.resource = 'change_templates' AND p.action = 'manage'))
    ON CONFLICT DO NOTHING;

    -- Assign basic permissions to agent
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND p.resource = 'changes' AND p.action IN ('read', 'create', 'update', 'implement')
    ON CONFLICT DO NOTHING;

    -- Requester can only read changes
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'requester'
    AND p.resource = 'changes' AND p.action IN ('read', 'create')
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);
}
