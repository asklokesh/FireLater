import { Pool } from 'pg';

export async function migration005OnCall(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- ============================================
    -- ON-CALL SCHEDULES
    -- ============================================

    CREATE TABLE oncall_schedules (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        timezone        VARCHAR(100) DEFAULT 'UTC',
        group_id        UUID REFERENCES groups(id) ON DELETE SET NULL,
        rotation_type   VARCHAR(50) DEFAULT 'weekly',
        rotation_length INTEGER DEFAULT 1,
        handoff_time    TIME DEFAULT '09:00',
        handoff_day     INTEGER DEFAULT 1,
        is_active       BOOLEAN DEFAULT true,
        color           VARCHAR(20),
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_oncall_schedules_group ON oncall_schedules(group_id);
    CREATE INDEX idx_oncall_schedules_active ON oncall_schedules(is_active) WHERE is_active = true;

    -- ============================================
    -- ON-CALL ROTATIONS (Members in rotation)
    -- ============================================

    CREATE TABLE oncall_rotations (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        position        INTEGER NOT NULL,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(schedule_id, user_id)
    );

    CREATE INDEX idx_oncall_rotations_schedule ON oncall_rotations(schedule_id);
    CREATE INDEX idx_oncall_rotations_user ON oncall_rotations(user_id);

    -- ============================================
    -- ON-CALL SHIFTS (Actual scheduled shifts)
    -- ============================================

    CREATE TABLE oncall_shifts (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        start_time      TIMESTAMPTZ NOT NULL,
        end_time        TIMESTAMPTZ NOT NULL,
        shift_type      VARCHAR(50) DEFAULT 'primary',
        layer           INTEGER DEFAULT 1,
        override_reason TEXT,
        original_user_id UUID REFERENCES users(id),
        created_by      UUID REFERENCES users(id),
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT valid_shift_times CHECK (end_time > start_time)
    );

    CREATE INDEX idx_oncall_shifts_schedule ON oncall_shifts(schedule_id);
    CREATE INDEX idx_oncall_shifts_user ON oncall_shifts(user_id);
    CREATE INDEX idx_oncall_shifts_time ON oncall_shifts(start_time, end_time);
    CREATE INDEX idx_oncall_shifts_current ON oncall_shifts(schedule_id, start_time, end_time)
        WHERE shift_type IN ('primary', 'override');

    -- ============================================
    -- ESCALATION POLICIES
    -- ============================================

    CREATE TABLE oncall_escalation_policies (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        repeat_count    INTEGER DEFAULT 3,
        repeat_delay_minutes INTEGER DEFAULT 5,
        is_default      BOOLEAN DEFAULT false,
        is_active       BOOLEAN DEFAULT true,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- ============================================
    -- ESCALATION STEPS
    -- ============================================

    CREATE TABLE oncall_escalation_steps (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id       UUID REFERENCES oncall_escalation_policies(id) ON DELETE CASCADE,
        step_number     INTEGER NOT NULL,
        delay_minutes   INTEGER DEFAULT 5,
        notify_type     VARCHAR(50) NOT NULL,
        schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        group_id        UUID REFERENCES groups(id) ON DELETE CASCADE,
        notification_channels TEXT[] DEFAULT ARRAY['email'],
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(policy_id, step_number)
    );

    CREATE INDEX idx_oncall_escalation_steps_policy ON oncall_escalation_steps(policy_id);

    -- ============================================
    -- SCHEDULE-APPLICATION LINKS
    -- ============================================

    CREATE TABLE oncall_schedule_applications (
        schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
        application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
        PRIMARY KEY (schedule_id, application_id)
    );

    -- ============================================
    -- ON-CALL PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('oncall', 'manage', 'Manage on-call schedules and policies')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Assign to admin
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND (p.resource, p.action) = ('oncall', 'manage')
    ON CONFLICT DO NOTHING;

    -- Assign to manager
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND (p.resource, p.action) = ('oncall', 'manage')
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);
}
