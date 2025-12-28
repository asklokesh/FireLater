import { Pool } from 'pg';

export async function migration003CatalogRequests(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- ============================================
    -- SERVICE CATALOG
    -- ============================================

    CREATE TABLE catalog_categories (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        icon            VARCHAR(100),
        parent_id       UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
        sort_order      INTEGER DEFAULT 0,
        is_active       BOOLEAN DEFAULT true,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_catalog_categories_parent ON catalog_categories(parent_id);
    CREATE INDEX idx_catalog_categories_active ON catalog_categories(is_active) WHERE is_active = true;

    CREATE TABLE catalog_items (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        short_description VARCHAR(500),
        description     TEXT,
        category_id     UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
        icon            VARCHAR(100),
        image_url       TEXT,
        form_schema     JSONB NOT NULL DEFAULT '{"fields":[]}',
        fulfillment_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        approval_required BOOLEAN DEFAULT false,
        approval_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        expected_completion_days INTEGER DEFAULT 5,
        cost_center     VARCHAR(100),
        price           DECIMAL(10,2),
        is_active       BOOLEAN DEFAULT true,
        sort_order      INTEGER DEFAULT 0,
        tags            TEXT[],
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_catalog_items_category ON catalog_items(category_id);
    CREATE INDEX idx_catalog_items_active ON catalog_items(is_active) WHERE is_active = true;
    CREATE INDEX idx_catalog_items_tags ON catalog_items USING gin(tags);

    CREATE TABLE catalog_bundles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        category_id     UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
        discount_percent DECIMAL(5,2),
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE catalog_bundle_items (
        bundle_id       UUID REFERENCES catalog_bundles(id) ON DELETE CASCADE,
        item_id         UUID REFERENCES catalog_items(id) ON DELETE CASCADE,
        quantity        INTEGER DEFAULT 1,
        PRIMARY KEY (bundle_id, item_id)
    );

    -- ============================================
    -- SERVICE REQUESTS
    -- ============================================

    CREATE TABLE service_requests (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_number  VARCHAR(50) NOT NULL UNIQUE,
        catalog_item_id UUID REFERENCES catalog_items(id),
        bundle_id       UUID REFERENCES catalog_bundles(id),
        requester_id    UUID REFERENCES users(id) NOT NULL,
        requested_for_id UUID REFERENCES users(id),
        status          VARCHAR(50) DEFAULT 'submitted',
        priority        VARCHAR(20) DEFAULT 'medium',
        form_data       JSONB DEFAULT '{}',
        notes           TEXT,
        cost_center     VARCHAR(100),
        total_cost      DECIMAL(10,2),
        fulfillment_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
        assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
        due_date        TIMESTAMPTZ,
        completed_at    TIMESTAMPTZ,
        completed_by    UUID REFERENCES users(id),
        cancelled_at    TIMESTAMPTZ,
        cancelled_by    UUID REFERENCES users(id),
        cancellation_reason TEXT,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_service_requests_number ON service_requests(request_number);
    CREATE INDEX idx_service_requests_status ON service_requests(status);
    CREATE INDEX idx_service_requests_requester ON service_requests(requester_id);
    CREATE INDEX idx_service_requests_assigned ON service_requests(assigned_to);
    CREATE INDEX idx_service_requests_catalog_item ON service_requests(catalog_item_id);
    CREATE INDEX idx_service_requests_created ON service_requests(created_at DESC);

    CREATE TABLE request_items (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id      UUID REFERENCES service_requests(id) ON DELETE CASCADE,
        catalog_item_id UUID REFERENCES catalog_items(id),
        quantity        INTEGER DEFAULT 1,
        form_data       JSONB DEFAULT '{}',
        status          VARCHAR(50) DEFAULT 'pending',
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_request_items_request ON request_items(request_id);

    -- ============================================
    -- APPROVALS
    -- ============================================

    CREATE TABLE request_approvals (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id      UUID REFERENCES service_requests(id) ON DELETE CASCADE,
        step_number     INTEGER NOT NULL DEFAULT 1,
        approver_id     UUID REFERENCES users(id),
        approver_group_id UUID REFERENCES groups(id),
        status          VARCHAR(50) DEFAULT 'pending',
        decision        VARCHAR(50),
        comments        TEXT,
        decided_at      TIMESTAMPTZ,
        due_date        TIMESTAMPTZ,
        reminder_sent   BOOLEAN DEFAULT false,
        delegated_to    UUID REFERENCES users(id),
        delegated_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_request_approvals_request ON request_approvals(request_id);
    CREATE INDEX idx_request_approvals_approver ON request_approvals(approver_id);
    CREATE INDEX idx_request_approvals_group ON request_approvals(approver_group_id);
    CREATE INDEX idx_request_approvals_status ON request_approvals(status);
    CREATE INDEX idx_request_approvals_pending ON request_approvals(status) WHERE status = 'pending';

    CREATE TABLE approval_templates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        steps           JSONB NOT NULL DEFAULT '[]',
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- ============================================
    -- REQUEST COMMENTS & HISTORY
    -- ============================================

    CREATE TABLE request_comments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id      UUID REFERENCES service_requests(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        content         TEXT NOT NULL,
        is_internal     BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_request_comments_request ON request_comments(request_id);

    CREATE TABLE request_status_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id      UUID REFERENCES service_requests(id) ON DELETE CASCADE,
        from_status     VARCHAR(50),
        to_status       VARCHAR(50) NOT NULL,
        changed_by      UUID REFERENCES users(id),
        reason          TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_request_status_history_request ON request_status_history(request_id);

    -- ============================================
    -- NOTIFICATIONS
    -- ============================================

    CREATE TABLE integrations (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        type            VARCHAR(50) NOT NULL,
        config          JSONB NOT NULL DEFAULT '{}',
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE notification_channels (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        type            VARCHAR(50) NOT NULL,
        integration_id  UUID REFERENCES integrations(id) ON DELETE SET NULL,
        config          JSONB NOT NULL DEFAULT '{}',
        is_default      BOOLEAN DEFAULT false,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE notification_preferences (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        event_type      VARCHAR(100) NOT NULL,
        channel_id      UUID REFERENCES notification_channels(id) ON DELETE CASCADE,
        enabled         BOOLEAN DEFAULT true,
        UNIQUE(user_id, event_type, channel_id)
    );

    CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);

    CREATE TABLE notifications (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
        channel_id      UUID REFERENCES notification_channels(id),
        event_type      VARCHAR(100) NOT NULL,
        title           VARCHAR(500) NOT NULL,
        body            TEXT,
        entity_type     VARCHAR(100),
        entity_id       UUID,
        metadata        JSONB DEFAULT '{}',
        status          VARCHAR(50) DEFAULT 'pending',
        sent_at         TIMESTAMPTZ,
        read_at         TIMESTAMPTZ,
        error           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_notifications_user ON notifications(user_id);
    CREATE INDEX idx_notifications_status ON notifications(status);
    CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

    CREATE TABLE notification_templates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type      VARCHAR(100) NOT NULL,
        channel_type    VARCHAR(50) NOT NULL,
        subject         VARCHAR(500),
        body_template   TEXT NOT NULL,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(event_type, channel_type)
    );

    -- Insert default notification templates
    INSERT INTO notification_templates (event_type, channel_type, subject, body_template) VALUES
        ('issue.created', 'email', 'New Issue: {{issue_number}}', 'A new issue has been created: {{title}}'),
        ('issue.assigned', 'email', 'Issue Assigned: {{issue_number}}', 'You have been assigned to issue: {{title}}'),
        ('issue.resolved', 'email', 'Issue Resolved: {{issue_number}}', 'Issue {{title}} has been resolved'),
        ('request.submitted', 'email', 'Request Submitted: {{request_number}}', 'Your request {{title}} has been submitted'),
        ('request.approved', 'email', 'Request Approved: {{request_number}}', 'Your request {{title}} has been approved'),
        ('request.rejected', 'email', 'Request Rejected: {{request_number}}', 'Your request {{title}} has been rejected'),
        ('request.completed', 'email', 'Request Completed: {{request_number}}', 'Your request {{title}} has been completed'),
        ('approval.pending', 'email', 'Approval Required: {{request_number}}', 'A request needs your approval: {{title}}');

    -- Update id_sequences for new entity types
    INSERT INTO id_sequences (entity_type, prefix, current_value) VALUES
        ('catalog_item', 'CAT', 0),
        ('bundle', 'BDL', 0)
    ON CONFLICT (entity_type) DO NOTHING;

    RESET search_path;
  `);
}
