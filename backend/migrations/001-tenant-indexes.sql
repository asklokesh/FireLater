-- Add composite indexes for tenant-aware queries
-- Requests table
CREATE INDEX IF NOT EXISTS idx_requests_tenant_created ON requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_status ON requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_assignee ON requests(tenant_id, assignee_id);

-- Assets table
CREATE INDEX IF NOT EXISTS idx_assets_tenant_created ON assets(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_status ON assets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_category ON assets(tenant_id, category_id);

-- Oncall schedules and shifts
CREATE INDEX IF NOT EXISTS idx_oncall_schedules_tenant ON oncall_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oncall_shifts_tenant_schedule ON oncall_shifts(tenant_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_oncall_shifts_tenant_user ON oncall_shifts(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_tenant ON shift_swap_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_tenant_schedule ON shift_swap_requests(tenant_id, schedule_id);

-- Users and teams
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant ON teams(tenant_id);