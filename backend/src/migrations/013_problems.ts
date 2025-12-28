import { Pool } from 'pg';

export async function migration013Problems(pool: Pool): Promise<void> {
  // Add problem sequence to the id_sequences table
  await pool.query(`
    -- ============================================
    -- PROBLEM MANAGEMENT MODULE
    -- ============================================
    -- ITIL Problem Management for root cause analysis
    -- and preventing recurring incidents

    -- Add problem sequence to tenant_template
    SET search_path TO tenant_template;

    -- Add problem ID sequence if not exists
    INSERT INTO id_sequences (entity_type, prefix, current_value)
    VALUES ('problem', 'PRB', 0)
    ON CONFLICT (entity_type) DO NOTHING;

    -- ============================================
    -- PROBLEMS TABLE
    -- ============================================

    CREATE TABLE IF NOT EXISTS problems (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_number  VARCHAR(50) NOT NULL UNIQUE,
        title           VARCHAR(500) NOT NULL,
        description     TEXT,
        status          VARCHAR(50) DEFAULT 'new',
        priority        VARCHAR(20) DEFAULT 'medium',
        impact          VARCHAR(50),
        urgency         VARCHAR(50),

        -- Classification
        category_id     UUID REFERENCES issue_categories(id),
        problem_type    VARCHAR(50) DEFAULT 'reactive',

        -- Related entities
        application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,

        -- Ownership
        reporter_id     UUID REFERENCES users(id),
        assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_group  UUID REFERENCES groups(id) ON DELETE SET NULL,

        -- Root Cause Analysis
        root_cause      TEXT,
        root_cause_identified_at TIMESTAMPTZ,
        root_cause_identified_by UUID REFERENCES users(id),

        -- Workaround
        workaround      TEXT,
        workaround_documented_at TIMESTAMPTZ,
        has_workaround  BOOLEAN DEFAULT false,

        -- Known Error
        is_known_error  BOOLEAN DEFAULT false,
        known_error_since TIMESTAMPTZ,
        known_error_id  VARCHAR(50),

        -- Resolution
        resolution      TEXT,
        resolution_code VARCHAR(100),
        resolved_at     TIMESTAMPTZ,
        resolved_by     UUID REFERENCES users(id),

        -- Closure
        closed_at       TIMESTAMPTZ,
        closed_by       UUID REFERENCES users(id),
        closure_code    VARCHAR(100),

        -- Metrics
        affected_services_count INTEGER DEFAULT 0,
        related_incidents_count INTEGER DEFAULT 0,
        recurrence_count INTEGER DEFAULT 0,

        -- SLA tracking
        sla_policy_id   UUID REFERENCES sla_policies(id),
        response_due_at TIMESTAMPTZ,
        resolution_due_at TIMESTAMPTZ,
        first_response_at TIMESTAMPTZ,
        sla_breached    BOOLEAN DEFAULT false,

        -- External references
        external_refs   JSONB DEFAULT '[]',
        tags            TEXT[],
        metadata        JSONB DEFAULT '{}',

        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_problems_number ON problems(problem_number);
    CREATE INDEX idx_problems_status ON problems(status);
    CREATE INDEX idx_problems_priority ON problems(priority);
    CREATE INDEX idx_problems_application ON problems(application_id);
    CREATE INDEX idx_problems_assigned_to ON problems(assigned_to);
    CREATE INDEX idx_problems_assigned_group ON problems(assigned_group);
    CREATE INDEX idx_problems_reporter ON problems(reporter_id);
    CREATE INDEX idx_problems_created ON problems(created_at DESC);
    CREATE INDEX idx_problems_known_error ON problems(is_known_error) WHERE is_known_error = true;
    CREATE INDEX idx_problems_open ON problems(status) WHERE status NOT IN ('resolved', 'closed');

    -- ============================================
    -- PROBLEM-ISSUE RELATIONSHIP (Many-to-Many)
    -- ============================================

    CREATE TABLE IF NOT EXISTS problem_issues (
        problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
        issue_id        UUID REFERENCES issues(id) ON DELETE CASCADE,
        relationship_type VARCHAR(50) DEFAULT 'caused_by',
        linked_by       UUID REFERENCES users(id),
        linked_at       TIMESTAMPTZ DEFAULT NOW(),
        notes           TEXT,
        PRIMARY KEY (problem_id, issue_id)
    );

    CREATE INDEX idx_problem_issues_problem ON problem_issues(problem_id);
    CREATE INDEX idx_problem_issues_issue ON problem_issues(issue_id);

    -- ============================================
    -- PROBLEM COMMENTS/ACTIVITIES
    -- ============================================

    CREATE TABLE IF NOT EXISTS problem_comments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        content         TEXT NOT NULL,
        content_type    VARCHAR(50) DEFAULT 'text',
        is_internal     BOOLEAN DEFAULT false,
        activity_type   VARCHAR(50) DEFAULT 'comment',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_problem_comments_problem ON problem_comments(problem_id);
    CREATE INDEX idx_problem_comments_created ON problem_comments(created_at);

    -- ============================================
    -- PROBLEM STATUS HISTORY
    -- ============================================

    CREATE TABLE IF NOT EXISTS problem_status_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
        from_status     VARCHAR(50),
        to_status       VARCHAR(50) NOT NULL,
        changed_by      UUID REFERENCES users(id),
        reason          TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_problem_status_history_problem ON problem_status_history(problem_id);

    -- ============================================
    -- PROBLEM WORKLOGS
    -- ============================================

    CREATE TABLE IF NOT EXISTS problem_worklogs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        time_spent      INTEGER NOT NULL,
        work_date       DATE NOT NULL DEFAULT CURRENT_DATE,
        description     TEXT,
        work_type       VARCHAR(50) DEFAULT 'analysis',
        billable        BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_problem_worklogs_problem ON problem_worklogs(problem_id);
    CREATE INDEX idx_problem_worklogs_user ON problem_worklogs(user_id);

    -- ============================================
    -- KNOWN ERRORS DATABASE (KEDB)
    -- ============================================

    CREATE TABLE IF NOT EXISTS known_errors (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ke_number       VARCHAR(50) NOT NULL UNIQUE,
        problem_id      UUID REFERENCES problems(id) ON DELETE SET NULL,
        title           VARCHAR(500) NOT NULL,
        description     TEXT,
        root_cause      TEXT NOT NULL,
        workaround      TEXT,
        symptoms        TEXT[],
        affected_cis    TEXT[],
        status          VARCHAR(50) DEFAULT 'active',

        -- Classification
        category_id     UUID REFERENCES issue_categories(id),
        application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,

        -- Impact
        impact_level    VARCHAR(20) DEFAULT 'medium',
        affected_users_estimate INTEGER,

        -- Resolution planning
        permanent_fix   TEXT,
        target_resolution_date DATE,
        resolution_plan TEXT,

        -- Metadata
        tags            TEXT[],
        metadata        JSONB DEFAULT '{}',

        created_by      UUID REFERENCES users(id),
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        retired_at      TIMESTAMPTZ,
        retired_by      UUID REFERENCES users(id)
    );

    CREATE INDEX idx_known_errors_number ON known_errors(ke_number);
    CREATE INDEX idx_known_errors_status ON known_errors(status);
    CREATE INDEX idx_known_errors_problem ON known_errors(problem_id);
    CREATE INDEX idx_known_errors_application ON known_errors(application_id);

    -- ============================================
    -- ADD PROBLEM REFERENCE TO ISSUES
    -- ============================================

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'tenant_template'
            AND table_name = 'issues'
            AND column_name = 'problem_id'
        ) THEN
            ALTER TABLE issues ADD COLUMN problem_id UUID REFERENCES problems(id) ON DELETE SET NULL;
            CREATE INDEX idx_issues_problem ON issues(problem_id) WHERE problem_id IS NOT NULL;
        END IF;
    END $$;

    -- ============================================
    -- PROBLEM PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('problems', 'create', 'Create problems'),
        ('problems', 'read', 'View problems'),
        ('problems', 'update', 'Update problems'),
        ('problems', 'delete', 'Delete problems'),
        ('problems', 'assign', 'Assign problems'),
        ('problems', 'resolve', 'Resolve problems'),
        ('known_errors', 'create', 'Create known errors'),
        ('known_errors', 'read', 'View known errors'),
        ('known_errors', 'update', 'Update known errors'),
        ('known_errors', 'delete', 'Delete known errors')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Grant permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('problems', 'known_errors')
    ON CONFLICT DO NOTHING;

    -- Grant permissions to manager role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND (p.resource, p.action) IN (
        ('problems', 'create'),
        ('problems', 'read'),
        ('problems', 'update'),
        ('problems', 'assign'),
        ('problems', 'resolve'),
        ('known_errors', 'read'),
        ('known_errors', 'update')
    )
    ON CONFLICT DO NOTHING;

    -- Grant permissions to agent role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND (p.resource, p.action) IN (
        ('problems', 'create'),
        ('problems', 'read'),
        ('problems', 'update'),
        ('known_errors', 'read')
    )
    ON CONFLICT DO NOTHING;

    -- Grant read access to requesters for known errors (self-service)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'requester'
    AND (p.resource, p.action) IN (
        ('known_errors', 'read')
    )
    ON CONFLICT DO NOTHING;

    -- ============================================
    -- PROBLEM SLA POLICY
    -- ============================================

    INSERT INTO sla_policies (name, description, entity_type, is_default) VALUES
        ('Default Problem SLA', 'Default SLA policy for problems', 'problem', true)
    ON CONFLICT DO NOTHING;

    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'response_time', 'critical', 60, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;
    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'response_time', 'high', 240, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;
    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'response_time', 'medium', 480, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;
    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'response_time', 'low', 1440, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;
    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'resolution_time', 'critical', 1440, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;
    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'resolution_time', 'high', 2880, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;
    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'resolution_time', 'medium', 10080, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;
    INSERT INTO sla_targets (policy_id, metric_type, priority, target_minutes, warning_percent)
    SELECT sp.id, 'resolution_time', 'low', 20160, 80 FROM sla_policies sp WHERE sp.entity_type = 'problem' AND sp.is_default = true
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);

  // Also add to any existing tenant schemas
  const tenantsResult = await pool.query(`
    SELECT slug FROM public.tenants WHERE status = 'active'
  `);

  for (const tenant of tenantsResult.rows) {
    const schema = `tenant_${tenant.slug.replace(/-/g, '_')}`;

    try {
      await pool.query(`
        SET search_path TO ${schema};

        -- Add problem ID sequence if not exists
        INSERT INTO id_sequences (entity_type, prefix, current_value)
        VALUES ('problem', 'PRB', 0)
        ON CONFLICT (entity_type) DO NOTHING;

        -- Create problems table
        CREATE TABLE IF NOT EXISTS problems (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            problem_number  VARCHAR(50) NOT NULL UNIQUE,
            title           VARCHAR(500) NOT NULL,
            description     TEXT,
            status          VARCHAR(50) DEFAULT 'new',
            priority        VARCHAR(20) DEFAULT 'medium',
            impact          VARCHAR(50),
            urgency         VARCHAR(50),
            category_id     UUID REFERENCES issue_categories(id),
            problem_type    VARCHAR(50) DEFAULT 'reactive',
            application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
            reporter_id     UUID REFERENCES users(id),
            assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
            assigned_group  UUID REFERENCES groups(id) ON DELETE SET NULL,
            root_cause      TEXT,
            root_cause_identified_at TIMESTAMPTZ,
            root_cause_identified_by UUID REFERENCES users(id),
            workaround      TEXT,
            workaround_documented_at TIMESTAMPTZ,
            has_workaround  BOOLEAN DEFAULT false,
            is_known_error  BOOLEAN DEFAULT false,
            known_error_since TIMESTAMPTZ,
            known_error_id  VARCHAR(50),
            resolution      TEXT,
            resolution_code VARCHAR(100),
            resolved_at     TIMESTAMPTZ,
            resolved_by     UUID REFERENCES users(id),
            closed_at       TIMESTAMPTZ,
            closed_by       UUID REFERENCES users(id),
            closure_code    VARCHAR(100),
            affected_services_count INTEGER DEFAULT 0,
            related_incidents_count INTEGER DEFAULT 0,
            recurrence_count INTEGER DEFAULT 0,
            sla_policy_id   UUID REFERENCES sla_policies(id),
            response_due_at TIMESTAMPTZ,
            resolution_due_at TIMESTAMPTZ,
            first_response_at TIMESTAMPTZ,
            sla_breached    BOOLEAN DEFAULT false,
            external_refs   JSONB DEFAULT '[]',
            tags            TEXT[],
            metadata        JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_problems_number ON problems(problem_number);
        CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
        CREATE INDEX IF NOT EXISTS idx_problems_priority ON problems(priority);
        CREATE INDEX IF NOT EXISTS idx_problems_application ON problems(application_id);
        CREATE INDEX IF NOT EXISTS idx_problems_assigned_to ON problems(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_problems_assigned_group ON problems(assigned_group);
        CREATE INDEX IF NOT EXISTS idx_problems_reporter ON problems(reporter_id);
        CREATE INDEX IF NOT EXISTS idx_problems_created ON problems(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_problems_known_error ON problems(is_known_error) WHERE is_known_error = true;
        CREATE INDEX IF NOT EXISTS idx_problems_open ON problems(status) WHERE status NOT IN ('resolved', 'closed');

        CREATE TABLE IF NOT EXISTS problem_issues (
            problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
            issue_id        UUID REFERENCES issues(id) ON DELETE CASCADE,
            relationship_type VARCHAR(50) DEFAULT 'caused_by',
            linked_by       UUID REFERENCES users(id),
            linked_at       TIMESTAMPTZ DEFAULT NOW(),
            notes           TEXT,
            PRIMARY KEY (problem_id, issue_id)
        );

        CREATE INDEX IF NOT EXISTS idx_problem_issues_problem ON problem_issues(problem_id);
        CREATE INDEX IF NOT EXISTS idx_problem_issues_issue ON problem_issues(issue_id);

        CREATE TABLE IF NOT EXISTS problem_comments (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
            user_id         UUID REFERENCES users(id),
            content         TEXT NOT NULL,
            content_type    VARCHAR(50) DEFAULT 'text',
            is_internal     BOOLEAN DEFAULT false,
            activity_type   VARCHAR(50) DEFAULT 'comment',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_problem_comments_problem ON problem_comments(problem_id);
        CREATE INDEX IF NOT EXISTS idx_problem_comments_created ON problem_comments(created_at);

        CREATE TABLE IF NOT EXISTS problem_status_history (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
            from_status     VARCHAR(50),
            to_status       VARCHAR(50) NOT NULL,
            changed_by      UUID REFERENCES users(id),
            reason          TEXT,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_problem_status_history_problem ON problem_status_history(problem_id);

        CREATE TABLE IF NOT EXISTS problem_worklogs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            problem_id      UUID REFERENCES problems(id) ON DELETE CASCADE,
            user_id         UUID REFERENCES users(id),
            time_spent      INTEGER NOT NULL,
            work_date       DATE NOT NULL DEFAULT CURRENT_DATE,
            description     TEXT,
            work_type       VARCHAR(50) DEFAULT 'analysis',
            billable        BOOLEAN DEFAULT false,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_problem_worklogs_problem ON problem_worklogs(problem_id);
        CREATE INDEX IF NOT EXISTS idx_problem_worklogs_user ON problem_worklogs(user_id);

        CREATE TABLE IF NOT EXISTS known_errors (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ke_number       VARCHAR(50) NOT NULL UNIQUE,
            problem_id      UUID REFERENCES problems(id) ON DELETE SET NULL,
            title           VARCHAR(500) NOT NULL,
            description     TEXT,
            root_cause      TEXT NOT NULL,
            workaround      TEXT,
            symptoms        TEXT[],
            affected_cis    TEXT[],
            status          VARCHAR(50) DEFAULT 'active',
            category_id     UUID REFERENCES issue_categories(id),
            application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
            impact_level    VARCHAR(20) DEFAULT 'medium',
            affected_users_estimate INTEGER,
            permanent_fix   TEXT,
            target_resolution_date DATE,
            resolution_plan TEXT,
            tags            TEXT[],
            metadata        JSONB DEFAULT '{}',
            created_by      UUID REFERENCES users(id),
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW(),
            retired_at      TIMESTAMPTZ,
            retired_by      UUID REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_known_errors_number ON known_errors(ke_number);
        CREATE INDEX IF NOT EXISTS idx_known_errors_status ON known_errors(status);
        CREATE INDEX IF NOT EXISTS idx_known_errors_problem ON known_errors(problem_id);
        CREATE INDEX IF NOT EXISTS idx_known_errors_application ON known_errors(application_id);

        -- Add problem_id column to issues if not exists
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = '${schema}'
                AND table_name = 'issues'
                AND column_name = 'problem_id'
            ) THEN
                ALTER TABLE issues ADD COLUMN problem_id UUID REFERENCES problems(id) ON DELETE SET NULL;
                CREATE INDEX idx_issues_problem ON issues(problem_id) WHERE problem_id IS NOT NULL;
            END IF;
        END $$;

        -- Add permissions
        INSERT INTO permissions (resource, action, description) VALUES
            ('problems', 'create', 'Create problems'),
            ('problems', 'read', 'View problems'),
            ('problems', 'update', 'Update problems'),
            ('problems', 'delete', 'Delete problems'),
            ('problems', 'assign', 'Assign problems'),
            ('problems', 'resolve', 'Resolve problems'),
            ('known_errors', 'create', 'Create known errors'),
            ('known_errors', 'read', 'View known errors'),
            ('known_errors', 'update', 'Update known errors'),
            ('known_errors', 'delete', 'Delete known errors')
        ON CONFLICT (resource, action) DO NOTHING;

        -- Grant permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'admin'
        AND p.resource IN ('problems', 'known_errors')
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'manager'
        AND (p.resource, p.action) IN (
            ('problems', 'create'),
            ('problems', 'read'),
            ('problems', 'update'),
            ('problems', 'assign'),
            ('problems', 'resolve'),
            ('known_errors', 'read'),
            ('known_errors', 'update')
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'agent'
        AND (p.resource, p.action) IN (
            ('problems', 'create'),
            ('problems', 'read'),
            ('problems', 'update'),
            ('known_errors', 'read')
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'requester'
        AND (p.resource, p.action) IN (
            ('known_errors', 'read')
        )
        ON CONFLICT DO NOTHING;

        -- Add SLA policy for problems
        INSERT INTO sla_policies (name, description, entity_type, is_default) VALUES
            ('Default Problem SLA', 'Default SLA policy for problems', 'problem', true)
        ON CONFLICT DO NOTHING;

        RESET search_path;
      `);
    } catch (err) {
      console.error(`Failed to apply migration to tenant ${tenant.slug}:`, err);
    }
  }
}
