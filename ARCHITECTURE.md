# FireLater - Lightweight IT Service Management Platform

## Executive Summary

FireLater is a streamlined IT Service Management (ITSM) SaaS platform designed for organizations that need core IT operations capabilities without the complexity and cost of enterprise solutions like ServiceNow.

## Core Modules

### 1. **Service Catalog** (Requests & Bundles)
- Simple drag-and-drop catalog builder
- Service request workflows
- Bundle creation (group multiple catalog items)
- Approval chains
- SLA tracking

### 2. **Issue Management** (Alternative to "Incidents")
- Issue tracking and resolution
- Priority/severity classification
- Assignment and escalation
- Impact tracking per application
- Resolution metrics

### 3. **On-Call Management**
- Calendar-based scheduling
- Rotation support (daily, weekly, custom)
- Escalation policies
- Integration with alerting systems
- Override/swap functionality

### 4. **Application Registry**
- Application inventory with unique IDs
- Environment management (dev, staging, prod)
- Tier classification (P1-P4)
- Owner/team assignments
- Automated health scoring

### 5. **Change Management**
- Change requests with approval workflows
- Change windows/maintenance windows
- Task breakdown and tracking
- Risk assessment
- CAB (Change Advisory Board) integration

### 6. **Identity & Access**
- Users and Groups
- Role-based access control (RBAC)
- SSO integration (SAML/OIDC)
- Team hierarchies

### 7. **Cloud Integrations**
- AWS (initial)
- Cost reporting
- Resource inventory sync
- CloudWatch metrics integration

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Web App (React/Next.js)  │  Mobile App (React Native)  │  Public API      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                     │
│                     (Kong / AWS API Gateway / Traefik)                      │
│         - Rate Limiting  - Auth  - Request Routing  - SSL Termination       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│   Core API Service   │ │  Integration Service │ │  Notification Service│
│   (Node.js/Go)       │ │  (Python/Go)         │ │  (Node.js)           │
│                      │ │                      │ │                      │
│ - Catalog            │ │ - AWS Integration    │ │ - Email              │
│ - Issues             │ │ - GCP (future)       │ │ - Slack              │
│ - Changes            │ │ - Azure (future)     │ │ - PagerDuty          │
│ - On-Call            │ │ - Webhooks           │ │ - SMS                │
│ - Apps               │ │                      │ │                      │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MESSAGE QUEUE                                      │
│                        (Redis / RabbitMQ / SQS)                              │
│              - Async processing  - Event distribution  - Retries            │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│   PostgreSQL         │ │   Redis              │ │   S3 / Object Store  │
│   (Primary DB)       │ │   (Cache + Sessions) │ │   (Attachments)      │
│                      │ │                      │ │                      │
│ - Multi-tenant       │ │ - Rate limiting      │ │ - Documents          │
│ - Row-level security │ │ - Real-time pub/sub  │ │ - Exports            │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
```

---

## Multi-Tenancy Model

### Approach: **Schema-per-tenant** (recommended for B2B SaaS)

```
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                          │
├─────────────────────────────────────────────────────────────────┤
│  Schema: public           │  Shared tables (plans, features)    │
├─────────────────────────────────────────────────────────────────┤
│  Schema: tenant_acme      │  All tenant-specific data           │
├─────────────────────────────────────────────────────────────────┤
│  Schema: tenant_globex    │  All tenant-specific data           │
├─────────────────────────────────────────────────────────────────┤
│  Schema: tenant_initech   │  All tenant-specific data           │
└─────────────────────────────────────────────────────────────────┘
```

Benefits:
- Data isolation for compliance (SOC2, GDPR)
- Easy per-tenant backup/restore
- Simple tenant removal
- Query performance (no tenant_id filtering everywhere)

---

## Database Schema Design

### Important Notes

1. **Schema-per-tenant**: Tables below are created per tenant schema (except `tenants` and `plans` which live in `public`)
2. **Foreign key references to `tenants(id)`**: Only needed in shared schema approach; omit in schema-per-tenant
3. **Sequence tables**: Used for generating human-readable IDs (REQ-00001, ISS-00001, etc.)

### Core Entities

```sql
-- ============================================
-- PUBLIC SCHEMA (Shared across all tenants)
-- ============================================

CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,  -- 'starter', 'professional', 'enterprise'
    display_name    VARCHAR(255) NOT NULL,
    max_users       INTEGER,                       -- NULL = unlimited
    max_applications INTEGER,
    features        JSONB DEFAULT '{}',            -- Feature flags
    price_monthly   DECIMAL(10,2),
    price_yearly    DECIMAL(10,2),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    plan_id         UUID REFERENCES plans(id),
    status          VARCHAR(50) DEFAULT 'active',  -- 'active', 'suspended', 'cancelled'
    settings        JSONB DEFAULT '{}',
    billing_email   VARCHAR(255),
    trial_ends_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================
-- TENANT SCHEMA (Created per tenant: tenant_{slug})
-- ============================================

-- ============================================
-- SEQUENCE COUNTERS (for human-readable IDs)
-- ============================================

CREATE TABLE id_sequences (
    entity_type     VARCHAR(50) PRIMARY KEY,  -- 'request', 'issue', 'change', 'task', 'application'
    prefix          VARCHAR(10) NOT NULL,      -- 'REQ', 'ISS', 'CHG', 'TSK', 'APP'
    current_value   BIGINT DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize sequences
INSERT INTO id_sequences (entity_type, prefix, current_value) VALUES
    ('request', 'REQ', 0),
    ('issue', 'ISS', 0),
    ('change', 'CHG', 0),
    ('task', 'TSK', 0),
    ('application', 'APP', 0);

-- Function to get next ID
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
    status          VARCHAR(20) DEFAULT 'active',  -- 'active', 'inactive', 'pending'
    auth_provider   VARCHAR(50) DEFAULT 'local',   -- 'local', 'google', 'okta', 'azure_ad'
    external_id     VARCHAR(255),                  -- SSO provider ID
    password_hash   TEXT,                          -- For local auth only
    last_login_at   TIMESTAMPTZ,
    settings        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_external_id ON users(auth_provider, external_id) WHERE external_id IS NOT NULL;

-- ============================================
-- ROLES & PERMISSIONS (RBAC)
-- ============================================

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,  -- 'admin', 'manager', 'agent', 'requester'
    display_name    VARCHAR(255) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN DEFAULT false,         -- System roles cannot be deleted
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource        VARCHAR(100) NOT NULL,         -- 'issues', 'changes', 'catalog', etc.
    action          VARCHAR(50) NOT NULL,          -- 'create', 'read', 'update', 'delete', 'approve'
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

-- ============================================
-- GROUPS
-- ============================================

CREATE TABLE groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    type            VARCHAR(50) DEFAULT 'team',    -- 'team', 'department', 'distribution'
    parent_id       UUID REFERENCES groups(id) ON DELETE SET NULL,
    manager_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    email           VARCHAR(255),                  -- Group email for notifications
    settings        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_groups_parent ON groups(parent_id);
CREATE INDEX idx_groups_type ON groups(type);

CREATE TABLE group_members (
    group_id        UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'member',  -- 'member', 'lead'
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_group_members_user ON group_members(user_id);

-- ============================================
-- APPLICATION REGISTRY
-- ============================================

CREATE TABLE applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id          VARCHAR(50) NOT NULL UNIQUE,   -- Human-readable ID like "APP-00001"
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    tier            VARCHAR(10) NOT NULL,          -- 'P1', 'P2', 'P3', 'P4'
    status          VARCHAR(50) DEFAULT 'active',  -- 'active', 'inactive', 'deprecated'
    lifecycle_stage VARCHAR(50) DEFAULT 'production', -- 'development', 'staging', 'production', 'sunset'
    owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    owner_group_id  UUID REFERENCES groups(id) ON DELETE SET NULL,
    support_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    business_unit   VARCHAR(255),
    criticality     VARCHAR(50),                   -- 'mission_critical', 'business_critical', 'business_operational', 'administrative'
    tags            TEXT[],
    metadata        JSONB DEFAULT '{}',
    health_score    DECIMAL(5,2),                  -- Calculated score 0-100
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
    name            VARCHAR(100) NOT NULL,         -- 'development', 'staging', 'production'
    type            VARCHAR(50) NOT NULL,          -- 'dev', 'test', 'staging', 'prod'
    url             TEXT,
    cloud_provider  VARCHAR(50),                   -- 'aws', 'gcp', 'azure', 'on-prem'
    cloud_account   VARCHAR(255),                  -- AWS account ID, etc.
    cloud_region    VARCHAR(50),
    resource_ids    JSONB DEFAULT '[]',            -- List of cloud resource IDs
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
    entity_type     VARCHAR(50) NOT NULL,          -- 'issue', 'request', 'change'
    is_default      BOOLEAN DEFAULT false,
    conditions      JSONB DEFAULT '{}',            -- {"priority": "critical", "tier": "P1"}
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sla_targets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id       UUID REFERENCES sla_policies(id) ON DELETE CASCADE,
    metric_type     VARCHAR(50) NOT NULL,          -- 'response_time', 'resolution_time', 'first_update'
    priority        VARCHAR(20) NOT NULL,          -- 'critical', 'high', 'medium', 'low'
    target_minutes  INTEGER NOT NULL,              -- Target time in minutes
    warning_percent INTEGER DEFAULT 80,            -- Warn at 80% of target
    business_hours_only BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(policy_id, metric_type, priority)
);

-- Business hours definition
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
    day_of_week     INTEGER NOT NULL,              -- 0=Sunday, 6=Saturday
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

-- ============================================
-- SERVICE CATALOG
-- ============================================

CREATE TABLE catalog_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    icon            VARCHAR(100),
    color           VARCHAR(20),                   -- Hex color for UI
    sort_order      INTEGER DEFAULT 0,
    parent_id       UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
    status          VARCHAR(50) DEFAULT 'active',  -- 'active', 'hidden'
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_catalog_categories_parent ON catalog_categories(parent_id);
CREATE INDEX idx_catalog_categories_sort ON catalog_categories(sort_order);

CREATE TABLE catalog_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    short_desc      VARCHAR(500),
    description     TEXT,                          -- Rich text / markdown
    icon            VARCHAR(100),
    image_url       TEXT,                          -- Item image
    status          VARCHAR(50) DEFAULT 'draft',   -- 'draft', 'active', 'retired'
    form_schema     JSONB NOT NULL DEFAULT '[]',   -- Dynamic form fields (JSON Schema)
    fulfillment_type VARCHAR(50) DEFAULT 'manual', -- 'manual', 'automated', 'hybrid'
    fulfillment_config JSONB DEFAULT '{}',         -- Automation config

    -- Approvals
    approval_required BOOLEAN DEFAULT false,
    approval_type   VARCHAR(50) DEFAULT 'sequential', -- 'sequential', 'parallel', 'any'
    approval_groups UUID[],                        -- Array of group IDs for approval chain

    -- SLA & Fulfillment
    sla_policy_id   UUID REFERENCES sla_policies(id),
    default_priority VARCHAR(20) DEFAULT 'medium',
    estimated_hours INTEGER,                       -- Expected fulfillment time

    -- Cost tracking
    cost            DECIMAL(10,2),
    cost_type       VARCHAR(50),                   -- 'one_time', 'monthly', 'yearly'
    cost_center     VARCHAR(100),

    -- Visibility
    visible_to_groups UUID[],                      -- NULL = visible to all

    tags            TEXT[],
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_catalog_items_category ON catalog_items(category_id);
CREATE INDEX idx_catalog_items_status ON catalog_items(status);

CREATE TABLE catalog_bundles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    icon            VARCHAR(100),
    status          VARCHAR(50) DEFAULT 'active',
    discount_percent DECIMAL(5,2),                 -- Bundle discount
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE catalog_bundle_items (
    bundle_id       UUID REFERENCES catalog_bundles(id) ON DELETE CASCADE,
    item_id         UUID REFERENCES catalog_items(id) ON DELETE CASCADE,
    quantity        INTEGER DEFAULT 1,
    sort_order      INTEGER DEFAULT 0,
    PRIMARY KEY (bundle_id, item_id)
);

CREATE TABLE service_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number  VARCHAR(50) NOT NULL UNIQUE,   -- "REQ-00001"
    catalog_item_id UUID REFERENCES catalog_items(id),
    bundle_id       UUID REFERENCES catalog_bundles(id),

    -- People
    requester_id    UUID REFERENCES users(id),
    requested_for_id UUID REFERENCES users(id),    -- Can request on behalf of others
    assigned_to     UUID REFERENCES users(id),
    assigned_group  UUID REFERENCES groups(id),

    -- Status
    status          VARCHAR(50) DEFAULT 'new',     -- 'new', 'pending_approval', 'approved', 'in_progress', 'completed', 'cancelled', 'rejected'
    priority        VARCHAR(20) DEFAULT 'medium',

    -- Form data
    form_data       JSONB DEFAULT '{}',            -- Submitted form values

    -- Approval tracking
    approval_status VARCHAR(50),                   -- 'pending', 'approved', 'rejected'
    current_approval_step INTEGER DEFAULT 0,

    -- SLA tracking
    sla_policy_id   UUID REFERENCES sla_policies(id),
    response_due_at TIMESTAMPTZ,
    resolution_due_at TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    sla_breached    BOOLEAN DEFAULT false,

    -- Completion
    due_date        TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    completion_notes TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_requests_number ON service_requests(request_number);
CREATE INDEX idx_requests_status ON service_requests(status);
CREATE INDEX idx_requests_requester ON service_requests(requester_id);
CREATE INDEX idx_requests_assigned ON service_requests(assigned_to);
CREATE INDEX idx_requests_created ON service_requests(created_at DESC);

CREATE TABLE request_approvals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID REFERENCES service_requests(id) ON DELETE CASCADE,
    step_number     INTEGER NOT NULL,
    approver_group_id UUID REFERENCES groups(id),
    approver_id     UUID REFERENCES users(id),     -- Actual approver
    status          VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    decision_at     TIMESTAMPTZ,
    comments        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_request_approvals_request ON request_approvals(request_id);
CREATE INDEX idx_request_approvals_status ON request_approvals(status);

-- ============================================
-- ISSUE MANAGEMENT (Incidents)
-- ============================================

CREATE TABLE issue_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    parent_id       UUID REFERENCES issue_categories(id) ON DELETE SET NULL,
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE issues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_number    VARCHAR(50) NOT NULL UNIQUE,   -- "ISS-00001"
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) DEFAULT 'new',     -- 'new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'
    priority        VARCHAR(20) DEFAULT 'medium',  -- 'critical', 'high', 'medium', 'low'
    severity        VARCHAR(20),                   -- 'S1', 'S2', 'S3', 'S4'
    impact          VARCHAR(50),                   -- 'widespread', 'significant', 'moderate', 'minor'
    urgency         VARCHAR(50),                   -- 'immediate', 'high', 'medium', 'low'

    -- Classification
    category_id     UUID REFERENCES issue_categories(id),
    issue_type      VARCHAR(50) DEFAULT 'issue',   -- 'issue', 'problem', 'question'
    source          VARCHAR(50),                   -- 'portal', 'email', 'phone', 'monitoring', 'api'

    -- Relationships
    application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
    environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,
    reporter_id     UUID REFERENCES users(id),
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_group  UUID REFERENCES groups(id) ON DELETE SET NULL,

    -- Escalation
    escalation_level INTEGER DEFAULT 0,
    escalated_at    TIMESTAMPTZ,
    escalation_policy_id UUID,                     -- References oncall_escalation_policies

    -- SLA tracking
    sla_policy_id   UUID REFERENCES sla_policies(id),
    response_due_at TIMESTAMPTZ,
    resolution_due_at TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    sla_breached    BOOLEAN DEFAULT false,
    sla_breach_type VARCHAR(50),                   -- 'response', 'resolution', 'both'

    -- Resolution
    resolution_code VARCHAR(100),
    resolution_notes TEXT,
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id),
    closed_at       TIMESTAMPTZ,
    closed_by       UUID REFERENCES users(id),

    -- Related issues
    parent_issue_id UUID REFERENCES issues(id),    -- For child issues / sub-tasks
    related_change_id UUID,                        -- Link to change that caused/fixed this

    -- External references
    external_refs   JSONB DEFAULT '[]',            -- [{type: 'jira', id: 'PROJ-123', url: '...'}]

    -- Metrics (calculated)
    time_to_first_response INTEGER,                -- Minutes
    time_to_resolution INTEGER,                    -- Minutes

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
    content_type    VARCHAR(50) DEFAULT 'text',    -- 'text', 'markdown'
    is_internal     BOOLEAN DEFAULT false,         -- Internal notes vs visible to requester
    is_resolution   BOOLEAN DEFAULT false,         -- Mark as resolution note
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_issue_comments_issue ON issue_comments(issue_id);
CREATE INDEX idx_issue_comments_created ON issue_comments(created_at);

CREATE TABLE issue_worklogs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id        UUID REFERENCES issues(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    time_spent      INTEGER NOT NULL,              -- Minutes
    work_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    description     TEXT,
    billable        BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_issue_worklogs_issue ON issue_worklogs(issue_id);
CREATE INDEX idx_issue_worklogs_user ON issue_worklogs(user_id);

-- Status history for tracking
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
-- ON-CALL MANAGEMENT
-- ============================================

CREATE TABLE oncall_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    timezone        VARCHAR(100) DEFAULT 'UTC',
    group_id        UUID REFERENCES groups(id) ON DELETE SET NULL,
    rotation_type   VARCHAR(50) DEFAULT 'weekly', -- 'daily', 'weekly', 'bi_weekly', 'custom'
    rotation_length INTEGER DEFAULT 1,            -- Number of days/weeks per rotation
    handoff_time    TIME DEFAULT '09:00',
    handoff_day     INTEGER DEFAULT 1,            -- 0=Sunday, 1=Monday for weekly
    status          VARCHAR(50) DEFAULT 'active',
    color           VARCHAR(20),                  -- For calendar display
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oncall_schedules_group ON oncall_schedules(group_id);
CREATE INDEX idx_oncall_schedules_status ON oncall_schedules(status);

CREATE TABLE oncall_rotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL,             -- Order in rotation (1, 2, 3...)
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schedule_id, user_id)
);

CREATE INDEX idx_oncall_rotations_schedule ON oncall_rotations(schedule_id);
CREATE INDEX idx_oncall_rotations_user ON oncall_rotations(user_id);

CREATE TABLE oncall_shifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    shift_type      VARCHAR(50) DEFAULT 'primary', -- 'primary', 'secondary', 'override'
    layer           INTEGER DEFAULT 1,            -- For multi-layer schedules
    override_reason TEXT,
    original_user_id UUID REFERENCES users(id),   -- Who was originally scheduled (for overrides)
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_shift_times CHECK (end_time > start_time)
);

CREATE INDEX idx_oncall_shifts_schedule ON oncall_shifts(schedule_id);
CREATE INDEX idx_oncall_shifts_user ON oncall_shifts(user_id);
CREATE INDEX idx_oncall_shifts_time ON oncall_shifts(start_time, end_time);
CREATE INDEX idx_oncall_shifts_current ON oncall_shifts(schedule_id, start_time, end_time)
    WHERE shift_type IN ('primary', 'override');

CREATE TABLE oncall_escalation_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    repeat_count    INTEGER DEFAULT 3,            -- How many times to cycle through steps
    repeat_delay_minutes INTEGER DEFAULT 5,       -- Delay between repeats
    is_default      BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE oncall_escalation_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id       UUID REFERENCES oncall_escalation_policies(id) ON DELETE CASCADE,
    step_number     INTEGER NOT NULL,
    delay_minutes   INTEGER DEFAULT 5,            -- Wait before this step
    notify_type     VARCHAR(50) NOT NULL,         -- 'schedule', 'user', 'group'
    schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id        UUID REFERENCES groups(id) ON DELETE CASCADE,
    notification_channels VARCHAR(50)[] DEFAULT ARRAY['email'], -- 'email', 'sms', 'slack', 'phone'
    UNIQUE(policy_id, step_number)
);

CREATE INDEX idx_oncall_escalation_steps_policy ON oncall_escalation_steps(policy_id);

-- Link schedules to applications
CREATE TABLE oncall_schedule_applications (
    schedule_id     UUID REFERENCES oncall_schedules(id) ON DELETE CASCADE,
    application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
    PRIMARY KEY (schedule_id, application_id)
);

-- ============================================
-- CHANGE MANAGEMENT
-- ============================================

-- Change windows MUST be defined before change_requests (referenced by FK)
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
    notify_before_minutes INTEGER DEFAULT 60,     -- Alert before window starts
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_change_windows_type ON change_windows(type);
CREATE INDEX idx_change_windows_status ON change_windows(status);

-- Change templates for standard changes
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
    default_tasks   JSONB DEFAULT '[]',           -- Pre-defined task list
    approval_required BOOLEAN DEFAULT false,
    approval_groups UUID[],
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

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
    status          VARCHAR(50) DEFAULT 'draft',  -- See status values below

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
    downtime_minutes INTEGER,                     -- Expected downtime

    -- Change window
    change_window_id UUID REFERENCES change_windows(id) ON DELETE SET NULL,

    -- Plans
    implementation_plan TEXT,
    rollback_plan   TEXT,
    test_plan       TEXT,
    communication_plan TEXT,

    -- Risk assessment
    risk_assessment JSONB DEFAULT '{}',           -- Structured risk scores

    -- CAB (Change Advisory Board)
    cab_required    BOOLEAN DEFAULT false,
    cab_date        TIMESTAMPTZ,
    cab_decision    VARCHAR(50),                  -- 'approved', 'rejected', 'deferred'
    cab_notes       TEXT,

    -- Outcome
    outcome         VARCHAR(50),                  -- 'successful', 'failed', 'partial', 'rolled_back'
    outcome_notes   TEXT,
    post_implementation_review BOOLEAN DEFAULT false,

    -- Related items
    related_issue_id UUID REFERENCES issues(id),  -- Issue this change addresses
    caused_issue_id UUID REFERENCES issues(id),   -- Issue caused by this change

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Change request statuses:
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

CREATE TABLE change_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id       UUID REFERENCES change_requests(id) ON DELETE CASCADE,
    task_number     VARCHAR(50) NOT NULL,         -- "TSK-00001"
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
    is_blocking     BOOLEAN DEFAULT true,         -- Must complete before next task
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_change_tasks_change ON change_tasks(change_id);
CREATE INDEX idx_change_tasks_assigned ON change_tasks(assigned_to);
CREATE INDEX idx_change_tasks_status ON change_tasks(status);

CREATE TABLE change_approvals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id       UUID REFERENCES change_requests(id) ON DELETE CASCADE,
    step_number     INTEGER DEFAULT 1,
    approver_group  UUID REFERENCES groups(id) ON DELETE SET NULL,
    approver_id     UUID REFERENCES users(id),    -- Actual approver
    status          VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    decision_at     TIMESTAMPTZ,
    comments        TEXT,
    required        BOOLEAN DEFAULT true,
    delegated_from  UUID REFERENCES users(id),    -- If approval was delegated
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_change_approvals_change ON change_approvals(change_id);
CREATE INDEX idx_change_approvals_status ON change_approvals(status);

-- Status history for changes
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
-- APPLICATION HEALTH SCORING
-- ============================================

CREATE TABLE app_health_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
    calculated_at   TIMESTAMPTZ DEFAULT NOW(),
    overall_score   DECIMAL(5,2) NOT NULL,         -- 0-100

    -- Component scores (all 0-100)
    issue_score     DECIMAL(5,2),                  -- Based on recent issues
    change_score    DECIMAL(5,2),                  -- Based on change success rate
    sla_score       DECIMAL(5,2),                  -- Based on SLA compliance
    uptime_score    DECIMAL(5,2),                  -- From cloud integrations

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
    tier_weight     DECIMAL(3,2),                  -- P1=1.5, P2=1.2, P3=1.0, P4=0.8

    -- Score trend
    score_change    DECIMAL(5,2),                  -- Change from previous calculation
    trend           VARCHAR(20),                   -- 'improving', 'stable', 'declining'

    metadata        JSONB DEFAULT '{}'
);

-- Index for time-series queries
CREATE INDEX idx_health_scores_app_time ON app_health_scores(application_id, calculated_at DESC);
CREATE INDEX idx_health_scores_score ON app_health_scores(overall_score);

-- Keep only latest score per app for quick lookups (materialized in app table)
CREATE INDEX idx_health_scores_latest ON app_health_scores(application_id, calculated_at DESC)
    WHERE calculated_at = (SELECT MAX(calculated_at) FROM app_health_scores hs WHERE hs.application_id = app_health_scores.application_id);

-- Health score configuration per tier
CREATE TABLE health_score_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier            VARCHAR(10) NOT NULL UNIQUE,   -- 'P1', 'P2', 'P3', 'P4'
    tier_weight     DECIMAL(3,2) NOT NULL,         -- Penalty multiplier

    -- Thresholds for score bands
    critical_threshold INTEGER DEFAULT 50,         -- Below = critical
    warning_threshold INTEGER DEFAULT 75,          -- Below = warning
    good_threshold INTEGER DEFAULT 90,             -- Below = good, above = excellent

    -- Issue penalties (points deducted per issue)
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
    provider        VARCHAR(50) NOT NULL,         -- 'aws', 'gcp', 'azure'
    account_id      VARCHAR(255) NOT NULL,        -- AWS Account ID, GCP Project, Azure Subscription
    name            VARCHAR(255) NOT NULL,
    description     TEXT,

    -- Credentials (encrypted at application level)
    credential_type VARCHAR(50) NOT NULL,         -- 'role_arn', 'access_key', 'service_account', 'managed_identity'
    credentials     JSONB,                        -- Encrypted credential data
    role_arn        TEXT,                         -- For AWS cross-account role assumption
    external_id     VARCHAR(255),                 -- For AWS role assumption

    -- Sync configuration
    sync_enabled    BOOLEAN DEFAULT true,
    sync_interval   INTEGER DEFAULT 3600,         -- Seconds
    sync_resources  BOOLEAN DEFAULT true,
    sync_costs      BOOLEAN DEFAULT true,
    sync_metrics    BOOLEAN DEFAULT false,        -- CloudWatch/Stackdriver metrics
    regions         TEXT[],                       -- Regions to sync, NULL = all

    -- Sync status
    last_sync_at    TIMESTAMPTZ,
    last_sync_status VARCHAR(50),                 -- 'success', 'partial', 'failed'
    last_sync_error TEXT,
    next_sync_at    TIMESTAMPTZ,

    status          VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'error'
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, account_id)
);

CREATE INDEX idx_cloud_accounts_provider ON cloud_accounts(provider);
CREATE INDEX idx_cloud_accounts_status ON cloud_accounts(status);

CREATE TABLE cloud_resources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
    resource_id     VARCHAR(500) NOT NULL,        -- ARN, resource ID, full path
    resource_type   VARCHAR(100) NOT NULL,        -- 'ec2:instance', 'rds:cluster', 's3:bucket'
    name            VARCHAR(255),
    region          VARCHAR(50),
    availability_zone VARCHAR(50),
    status          VARCHAR(50),                  -- Provider-specific status

    -- Resource details
    tags            JSONB DEFAULT '{}',
    metadata        JSONB DEFAULT '{}',           -- Provider-specific metadata
    configuration   JSONB DEFAULT '{}',           -- Instance type, size, etc.

    -- Link to application (can be auto-mapped via tags)
    application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
    environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,
    auto_mapped     BOOLEAN DEFAULT false,        -- Was this mapping automatic?

    -- Cost tracking (updated by cost sync)
    hourly_cost     DECIMAL(12,4),
    monthly_cost    DECIMAL(12,2),
    cost_updated_at TIMESTAMPTZ,

    -- Lifecycle
    first_seen      TIMESTAMPTZ DEFAULT NOW(),
    last_seen       TIMESTAMPTZ DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT false,        -- Soft delete when resource disappears
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

-- Cost reports aggregated by period
CREATE TABLE cloud_cost_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
    application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
    environment_id  UUID REFERENCES environments(id) ON DELETE SET NULL,

    period_type     VARCHAR(20) NOT NULL,         -- 'daily', 'monthly'
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,

    total_cost      DECIMAL(12,2) NOT NULL,
    currency        VARCHAR(10) DEFAULT 'USD',

    -- Breakdowns
    cost_by_service JSONB DEFAULT '{}',           -- {"EC2": 100.00, "RDS": 50.00}
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

-- Cloud metrics for uptime/health scoring
CREATE TABLE cloud_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE CASCADE,
    resource_id     VARCHAR(500),
    application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,

    metric_name     VARCHAR(100) NOT NULL,        -- 'cpu_utilization', 'availability', 'error_rate'
    metric_namespace VARCHAR(100),                -- 'AWS/EC2', 'AWS/RDS'

    timestamp       TIMESTAMPTZ NOT NULL,
    value           DECIMAL(20,6) NOT NULL,
    unit            VARCHAR(50),                  -- 'Percent', 'Count', 'Bytes'

    dimensions      JSONB DEFAULT '{}',           -- Additional metric dimensions

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Partition by time for efficient querying
CREATE INDEX idx_cloud_metrics_time ON cloud_metrics(timestamp DESC);
CREATE INDEX idx_cloud_metrics_app ON cloud_metrics(application_id, metric_name, timestamp DESC);

-- Auto-mapping rules for resources to applications
CREATE TABLE cloud_resource_mapping_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    priority        INTEGER DEFAULT 100,          -- Lower = higher priority

    -- Matching criteria
    provider        VARCHAR(50),                  -- NULL = all providers
    resource_type   VARCHAR(100),                 -- NULL = all types
    tag_key         VARCHAR(255) NOT NULL,        -- e.g., 'Application', 'app-id'
    tag_value_pattern VARCHAR(255),               -- Regex pattern, NULL = use value as app_id

    -- Target
    application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
    environment_type VARCHAR(50),                 -- Map to environment by type

    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mapping_rules_priority ON cloud_resource_mapping_rules(priority);

-- ============================================
-- AUDIT & ACTIVITY
-- ============================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID,
    user_id         UUID,
    action          VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'approve', etc.
    entity_type     VARCHAR(100) NOT NULL, -- 'issue', 'change_request', etc.
    entity_id       UUID NOT NULL,
    changes         JSONB,                 -- {field: {old: x, new: y}}
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Partition audit logs by month for performance
-- CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
-- FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================
-- ATTACHMENTS
-- ============================================

CREATE TABLE attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id),
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID NOT NULL,
    filename        VARCHAR(500) NOT NULL,
    content_type    VARCHAR(100),
    size_bytes      BIGINT,
    storage_path    TEXT NOT NULL,         -- S3 path
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS & INTEGRATIONS
-- ============================================

-- Integration configurations (Slack, PagerDuty, etc.)
CREATE TABLE integrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            VARCHAR(50) NOT NULL,         -- 'slack', 'pagerduty', 'teams', 'email', 'webhook'
    name            VARCHAR(255) NOT NULL,
    description     TEXT,

    -- Configuration (encrypted sensitive fields)
    config          JSONB NOT NULL DEFAULT '{}',  -- API keys, webhook URLs, etc.

    -- Status
    status          VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'error'
    last_test_at    TIMESTAMPTZ,
    last_test_status VARCHAR(50),
    last_error      TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_integrations_type ON integrations(type);

-- Notification channels (where to send)
CREATE TABLE notification_channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id  UUID REFERENCES integrations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    channel_type    VARCHAR(50) NOT NULL,         -- 'email', 'slack_channel', 'slack_dm', 'pagerduty_service', 'webhook'

    -- Channel-specific config
    config          JSONB NOT NULL DEFAULT '{}',  -- {channel_id, email, webhook_url, etc.}

    is_default      BOOLEAN DEFAULT false,
    status          VARCHAR(50) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- User notification preferences
CREATE TABLE notification_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    event_category  VARCHAR(100) NOT NULL,        -- 'issues', 'changes', 'requests', 'oncall'
    event_type      VARCHAR(100) NOT NULL,        -- 'assigned', 'status_changed', 'sla_warning', etc.

    -- Channels enabled for this event
    email_enabled   BOOLEAN DEFAULT true,
    slack_enabled   BOOLEAN DEFAULT false,
    sms_enabled     BOOLEAN DEFAULT false,
    push_enabled    BOOLEAN DEFAULT true,

    -- Timing preferences
    instant         BOOLEAN DEFAULT true,         -- Send immediately
    digest          BOOLEAN DEFAULT false,        -- Include in digest
    quiet_hours     BOOLEAN DEFAULT true,         -- Respect quiet hours

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_category, event_type)
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);

-- User quiet hours / do not disturb
CREATE TABLE user_quiet_hours (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    day_of_week     INTEGER,                      -- NULL = all days, 0-6 = specific day
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    timezone        VARCHAR(100) NOT NULL,
    exceptions      VARCHAR(50)[],                -- Event types that bypass quiet hours: ['oncall', 'critical']
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Notification queue/log
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    channel_id      UUID REFERENCES notification_channels(id) ON DELETE SET NULL,

    -- Event details
    event_category  VARCHAR(100) NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(100),
    entity_id       UUID,

    -- Content
    subject         VARCHAR(500),
    content         TEXT,
    content_html    TEXT,
    data            JSONB DEFAULT '{}',           -- Structured data for templates

    -- Delivery
    priority        VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    status          VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped'
    attempts        INTEGER DEFAULT 0,
    max_attempts    INTEGER DEFAULT 3,
    scheduled_at    TIMESTAMPTZ DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    error           TEXT,

    -- Tracking
    opened_at       TIMESTAMPTZ,
    clicked_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_notifications_entity ON notifications(entity_type, entity_id);

-- Notification templates
CREATE TABLE notification_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_category  VARCHAR(100) NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    channel_type    VARCHAR(50) NOT NULL,         -- 'email', 'slack', 'sms'

    subject_template TEXT,                        -- For email
    body_template   TEXT NOT NULL,                -- Handlebars/Mustache template
    is_default      BOOLEAN DEFAULT false,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_category, event_type, channel_type, is_default)
);

-- Webhook subscriptions for external integrations
CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    url             TEXT NOT NULL,
    secret          TEXT,                         -- For signature verification
    events          TEXT[] NOT NULL,              -- ['issue.created', 'change.approved']

    -- Configuration
    active          BOOLEAN DEFAULT true,
    headers         JSONB DEFAULT '{}',           -- Custom headers to include
    retry_count     INTEGER DEFAULT 3,

    -- Status
    last_triggered_at TIMESTAMPTZ,
    last_status     VARCHAR(50),
    failure_count   INTEGER DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_active ON webhooks(active) WHERE active = true;

-- Webhook delivery log
CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID REFERENCES webhooks(id) ON DELETE CASCADE,
    event           VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,

    -- Response
    status_code     INTEGER,
    response_body   TEXT,
    response_time_ms INTEGER,

    -- Retry tracking
    attempt         INTEGER DEFAULT 1,
    success         BOOLEAN,
    error           TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);
```

---

## Health Score Algorithm

```python
def calculate_health_score(app_id: str, tier: str) -> float:
    """
    Calculate application health score (0-100)

    Components:
    - Issue Score (40%): Based on issues in last 30 days
    - Change Score (25%): Based on failed changes
    - SLA Score (25%): Based on SLA compliance
    - Uptime Score (10%): From cloud monitoring

    Tier weights adjust severity:
    - P1 (Critical): 1.5x weight on penalties
    - P2 (High): 1.2x weight
    - P3 (Medium): 1.0x weight
    - P4 (Low): 0.8x weight
    """

    TIER_WEIGHTS = {'P1': 1.5, 'P2': 1.2, 'P3': 1.0, 'P4': 0.8}
    tier_weight = TIER_WEIGHTS.get(tier, 1.0)

    # Issue Score (start at 100, deduct for issues)
    issues_30d = get_issues_count(app_id, days=30)
    critical_issues = get_critical_issues_count(app_id, days=30)

    issue_penalty = (issues_30d * 2) + (critical_issues * 10)
    issue_score = max(0, 100 - (issue_penalty * tier_weight))

    # Change Score
    total_changes = get_changes_count(app_id, days=30)
    failed_changes = get_failed_changes_count(app_id, days=30)

    if total_changes > 0:
        change_score = ((total_changes - failed_changes) / total_changes) * 100
    else:
        change_score = 100

    # SLA Score
    total_issues = get_issues_with_sla(app_id, days=30)
    sla_breaches = get_sla_breaches(app_id, days=30)

    if total_issues > 0:
        sla_score = ((total_issues - sla_breaches) / total_issues) * 100
    else:
        sla_score = 100

    # Uptime Score (from cloud metrics)
    uptime_score = get_uptime_percentage(app_id, days=30) or 100

    # Weighted average
    overall_score = (
        (issue_score * 0.40) +
        (change_score * 0.25) +
        (sla_score * 0.25) +
        (uptime_score * 0.10)
    )

    return round(overall_score, 2)
```

---

## API Structure

### Base URL: `https://api.firelater.io/v1`

### Authentication
- Bearer token (JWT) with short expiry (15min)
- Refresh tokens (7 days, rotated on use)
- API keys for service accounts (with scoped permissions)
- OAuth2/OIDC for SSO (Google, Okta, Azure AD)

### Request/Response Format
- All requests/responses use JSON
- Pagination: `?page=1&per_page=25` (max 100)
- Sorting: `?sort=created_at&order=desc`
- Filtering: `?status=open&priority=high`
- Field selection: `?fields=id,title,status`
- Include relations: `?include=assignee,application`

### Core Endpoints

```yaml
# ============================================
# AUTHENTICATION
# ============================================
POST   /auth/login                    # Email/password login
POST   /auth/logout                   # Invalidate session
POST   /auth/refresh                  # Refresh access token
POST   /auth/forgot-password          # Request password reset
POST   /auth/reset-password           # Complete password reset
GET    /auth/sso/{provider}           # Initiate SSO flow
POST   /auth/sso/{provider}/callback  # SSO callback
GET    /auth/me                       # Current user profile

# ============================================
# USERS & GROUPS
# ============================================
GET    /users                         # List users (paginated, filterable)
POST   /users                         # Create user (admin only)
GET    /users/{id}                    # Get user details
PUT    /users/{id}                    # Update user
DELETE /users/{id}                    # Deactivate user
PUT    /users/{id}/password           # Change password
GET    /users/{id}/groups             # User's group memberships
GET    /users/{id}/notifications      # User's notification preferences
PUT    /users/{id}/notifications      # Update notification preferences

GET    /groups                        # List groups
POST   /groups                        # Create group
GET    /groups/{id}                   # Get group details
PUT    /groups/{id}                   # Update group
DELETE /groups/{id}                   # Delete group
GET    /groups/{id}/members           # List group members
POST   /groups/{id}/members           # Add member to group
DELETE /groups/{id}/members/{userId}  # Remove member from group

GET    /roles                         # List roles
GET    /roles/{id}                    # Get role with permissions
POST   /roles                         # Create custom role
PUT    /roles/{id}                    # Update role
GET    /permissions                   # List all permissions

# ============================================
# APPLICATIONS & ENVIRONMENTS
# ============================================
GET    /applications                  # List applications
POST   /applications                  # Create application
GET    /applications/{id}             # Get application details
PUT    /applications/{id}             # Update application
DELETE /applications/{id}             # Delete application (soft delete)

GET    /applications/{id}/environments        # List environments
POST   /applications/{id}/environments        # Create environment
GET    /applications/{id}/environments/{envId}  # Get environment
PUT    /applications/{id}/environments/{envId}  # Update environment
DELETE /applications/{id}/environments/{envId}  # Delete environment

GET    /applications/{id}/health              # Current health score
GET    /applications/{id}/health/history      # Health score history
GET    /applications/{id}/issues              # Issues for this app
GET    /applications/{id}/changes             # Changes for this app
GET    /applications/{id}/resources           # Cloud resources linked
GET    /applications/{id}/costs               # Cost breakdown
GET    /applications/{id}/oncall              # Who's on-call for this app

# ============================================
# SERVICE CATALOG
# ============================================
GET    /catalog/categories            # List categories (hierarchical)
POST   /catalog/categories            # Create category
GET    /catalog/categories/{id}       # Get category
PUT    /catalog/categories/{id}       # Update category
DELETE /catalog/categories/{id}       # Delete category

GET    /catalog/items                 # List catalog items
POST   /catalog/items                 # Create catalog item
GET    /catalog/items/{id}            # Get catalog item
PUT    /catalog/items/{id}            # Update catalog item
DELETE /catalog/items/{id}            # Retire catalog item
POST   /catalog/items/{id}/publish    # Publish draft item
POST   /catalog/items/{id}/clone      # Clone item as draft

GET    /catalog/bundles               # List bundles
POST   /catalog/bundles               # Create bundle
GET    /catalog/bundles/{id}          # Get bundle
PUT    /catalog/bundles/{id}          # Update bundle
DELETE /catalog/bundles/{id}          # Delete bundle

# ============================================
# SERVICE REQUESTS
# ============================================
GET    /requests                      # List requests (filterable)
POST   /requests                      # Submit new request
GET    /requests/{id}                 # Get request details
PUT    /requests/{id}                 # Update request
DELETE /requests/{id}                 # Cancel request

POST   /requests/{id}/approve         # Approve request
POST   /requests/{id}/reject          # Reject request
POST   /requests/{id}/assign          # Assign to user/group
POST   /requests/{id}/reassign        # Reassign request
POST   /requests/{id}/complete        # Mark as completed
POST   /requests/{id}/reopen          # Reopen completed request

GET    /requests/{id}/comments        # List comments
POST   /requests/{id}/comments        # Add comment
GET    /requests/{id}/approvals       # Approval chain status
GET    /requests/{id}/history         # Status history

# ============================================
# ISSUES (Incidents)
# ============================================
GET    /issues                        # List issues (filterable)
POST   /issues                        # Create issue
GET    /issues/{id}                   # Get issue details
PUT    /issues/{id}                   # Update issue
DELETE /issues/{id}                   # Delete issue (soft)

POST   /issues/{id}/assign            # Assign to user/group
POST   /issues/{id}/reassign          # Reassign issue
POST   /issues/{id}/escalate          # Escalate issue
POST   /issues/{id}/resolve           # Resolve issue
POST   /issues/{id}/close             # Close issue
POST   /issues/{id}/reopen            # Reopen closed issue

GET    /issues/{id}/comments          # List comments
POST   /issues/{id}/comments          # Add comment
PUT    /issues/{id}/comments/{cid}    # Edit comment
DELETE /issues/{id}/comments/{cid}    # Delete comment

GET    /issues/{id}/worklogs          # List work logs
POST   /issues/{id}/worklogs          # Add work log
PUT    /issues/{id}/worklogs/{wid}    # Update work log
DELETE /issues/{id}/worklogs/{wid}    # Delete work log

GET    /issues/{id}/history           # Status history
GET    /issues/{id}/related           # Related issues/changes
POST   /issues/{id}/link              # Link to another issue/change

GET    /issues/categories             # List issue categories
POST   /issues/categories             # Create category
PUT    /issues/categories/{id}        # Update category

# ============================================
# ON-CALL MANAGEMENT
# ============================================
GET    /oncall/schedules              # List schedules
POST   /oncall/schedules              # Create schedule
GET    /oncall/schedules/{id}         # Get schedule details
PUT    /oncall/schedules/{id}         # Update schedule
DELETE /oncall/schedules/{id}         # Delete schedule

GET    /oncall/schedules/{id}/rotations       # List rotation members
POST   /oncall/schedules/{id}/rotations       # Add user to rotation
PUT    /oncall/schedules/{id}/rotations/{rid} # Update rotation position
DELETE /oncall/schedules/{id}/rotations/{rid} # Remove from rotation

GET    /oncall/schedules/{id}/shifts          # List shifts (date range)
POST   /oncall/schedules/{id}/shifts          # Create manual shift
PUT    /oncall/schedules/{id}/shifts/{sid}    # Update shift
DELETE /oncall/schedules/{id}/shifts/{sid}    # Delete shift

POST   /oncall/schedules/{id}/override        # Create override
POST   /oncall/schedules/{id}/swap            # Request shift swap

GET    /oncall/who-is-on-call         # Current on-call by schedule/app
GET    /oncall/my-shifts              # Current user's upcoming shifts

GET    /oncall/escalation-policies            # List escalation policies
POST   /oncall/escalation-policies            # Create policy
GET    /oncall/escalation-policies/{id}       # Get policy details
PUT    /oncall/escalation-policies/{id}       # Update policy
DELETE /oncall/escalation-policies/{id}       # Delete policy

# ============================================
# CHANGE MANAGEMENT
# ============================================
GET    /changes                       # List change requests
POST   /changes                       # Create change request
GET    /changes/{id}                  # Get change details
PUT    /changes/{id}                  # Update change
DELETE /changes/{id}                  # Cancel change

POST   /changes/{id}/submit           # Submit for approval
POST   /changes/{id}/approve          # Approve change
POST   /changes/{id}/reject           # Reject change
POST   /changes/{id}/schedule         # Schedule approved change
POST   /changes/{id}/start            # Begin implementation
POST   /changes/{id}/complete         # Complete change
POST   /changes/{id}/fail             # Mark as failed
POST   /changes/{id}/rollback         # Mark as rolled back

GET    /changes/{id}/tasks            # List tasks
POST   /changes/{id}/tasks            # Create task
PUT    /changes/{id}/tasks/{tid}      # Update task
DELETE /changes/{id}/tasks/{tid}      # Delete task
POST   /changes/{id}/tasks/{tid}/start    # Start task
POST   /changes/{id}/tasks/{tid}/complete # Complete task

GET    /changes/{id}/approvals        # Approval status
GET    /changes/{id}/history          # Status history
GET    /changes/{id}/comments         # Comments
POST   /changes/{id}/comments         # Add comment

GET    /change-windows                # List change windows
POST   /change-windows                # Create change window
GET    /change-windows/{id}           # Get change window
PUT    /change-windows/{id}           # Update change window
DELETE /change-windows/{id}           # Delete change window
GET    /change-windows/upcoming       # Upcoming windows (calendar view)

GET    /change-templates              # List templates
POST   /change-templates              # Create template
GET    /change-templates/{id}         # Get template
PUT    /change-templates/{id}         # Update template
DELETE /change-templates/{id}         # Delete template

# ============================================
# SLA CONFIGURATION
# ============================================
GET    /sla/policies                  # List SLA policies
POST   /sla/policies                  # Create policy
GET    /sla/policies/{id}             # Get policy
PUT    /sla/policies/{id}             # Update policy
DELETE /sla/policies/{id}             # Delete policy

GET    /sla/business-hours            # List business hours configs
POST   /sla/business-hours            # Create business hours
PUT    /sla/business-hours/{id}       # Update business hours
DELETE /sla/business-hours/{id}       # Delete business hours

# ============================================
# CLOUD INTEGRATIONS
# ============================================
GET    /cloud/accounts                # List cloud accounts
POST   /cloud/accounts                # Add cloud account
GET    /cloud/accounts/{id}           # Get account details
PUT    /cloud/accounts/{id}           # Update account
DELETE /cloud/accounts/{id}           # Remove account
POST   /cloud/accounts/{id}/test      # Test connection
POST   /cloud/accounts/{id}/sync      # Trigger manual sync

GET    /cloud/resources               # List all resources
GET    /cloud/resources/{id}          # Get resource details
PUT    /cloud/resources/{id}          # Update resource (link to app)
GET    /cloud/resources/unlinked      # Resources not linked to apps

GET    /cloud/costs                   # Cost summary
GET    /cloud/costs/by-application    # Costs grouped by app
GET    /cloud/costs/by-service        # Costs grouped by service
GET    /cloud/costs/trends            # Cost trends over time

GET    /cloud/mapping-rules           # List auto-mapping rules
POST   /cloud/mapping-rules           # Create mapping rule
PUT    /cloud/mapping-rules/{id}      # Update rule
DELETE /cloud/mapping-rules/{id}      # Delete rule

# ============================================
# INTEGRATIONS & WEBHOOKS
# ============================================
GET    /integrations                  # List integrations
POST   /integrations                  # Create integration
GET    /integrations/{id}             # Get integration
PUT    /integrations/{id}             # Update integration
DELETE /integrations/{id}             # Delete integration
POST   /integrations/{id}/test        # Test integration

GET    /webhooks                      # List webhooks
POST   /webhooks                      # Create webhook
GET    /webhooks/{id}                 # Get webhook
PUT    /webhooks/{id}                 # Update webhook
DELETE /webhooks/{id}                 # Delete webhook
POST   /webhooks/{id}/test            # Send test payload
GET    /webhooks/{id}/deliveries      # Delivery history

# ============================================
# REPORTS & ANALYTICS
# ============================================
GET    /reports/health-scores         # Health scores across apps
GET    /reports/health-trends         # Health score trends
GET    /reports/sla-performance       # SLA compliance report
GET    /reports/issue-trends          # Issue volume/resolution trends
GET    /reports/issue-mttr            # Mean time to resolve
GET    /reports/change-success-rate   # Change success/failure rates
GET    /reports/change-volume         # Change volume over time
GET    /reports/cost-allocation       # Cost by app/team
GET    /reports/cost-trends           # Cost trends over time
GET    /reports/oncall-coverage       # On-call coverage report
GET    /reports/workload              # Workload by user/team

POST   /reports/export                # Export report as CSV/PDF

# ============================================
# SEARCH
# ============================================
GET    /search                        # Global search across entities
GET    /search/issues                 # Search issues
GET    /search/changes                # Search changes
GET    /search/requests               # Search requests

# ============================================
# AUDIT LOG
# ============================================
GET    /audit-logs                    # Query audit logs (admin only)
GET    /audit-logs/{entityType}/{id}  # Audit history for entity
```

### Webhook Events

```yaml
# Issues
issue.created
issue.updated
issue.assigned
issue.escalated
issue.resolved
issue.closed
issue.sla_warning      # SLA approaching breach
issue.sla_breached

# Service Requests
request.created
request.submitted
request.approved
request.rejected
request.completed

# Changes
change.created
change.submitted
change.approved
change.rejected
change.started
change.completed
change.failed
change.rolled_back

# On-Call
oncall.shift_starting  # Shift starting in X minutes
oncall.escalation      # Issue escalated

# Health
health.score_changed   # Significant score change
health.threshold_crossed  # Crossed critical/warning threshold
```

---

## Catalog Form Schema Specification

The `form_schema` field in `catalog_items` uses a JSON structure to define dynamic forms. This enables the drag-and-drop catalog builder.

```json
{
  "version": "1.0",
  "fields": [
    {
      "id": "field_1",
      "type": "text",
      "label": "Laptop Model",
      "placeholder": "e.g., MacBook Pro 14\"",
      "required": true,
      "validation": {
        "min_length": 3,
        "max_length": 100
      }
    },
    {
      "id": "field_2",
      "type": "select",
      "label": "RAM Configuration",
      "required": true,
      "options": [
        {"value": "16gb", "label": "16 GB"},
        {"value": "32gb", "label": "32 GB"},
        {"value": "64gb", "label": "64 GB (+$200)"}
      ],
      "default": "16gb"
    },
    {
      "id": "field_3",
      "type": "multi_select",
      "label": "Additional Software",
      "required": false,
      "options": [
        {"value": "office", "label": "Microsoft Office"},
        {"value": "adobe", "label": "Adobe Creative Suite"},
        {"value": "slack", "label": "Slack"}
      ]
    },
    {
      "id": "field_4",
      "type": "textarea",
      "label": "Business Justification",
      "required": true,
      "validation": {
        "min_length": 50
      }
    },
    {
      "id": "field_5",
      "type": "date",
      "label": "Needed By",
      "required": true,
      "validation": {
        "min_date": "today",
        "max_date": "+90d"
      }
    },
    {
      "id": "field_6",
      "type": "user_picker",
      "label": "Deliver To",
      "required": true,
      "allow_self": true
    },
    {
      "id": "field_7",
      "type": "application_picker",
      "label": "Associated Application",
      "required": false,
      "filter": {
        "status": ["active"]
      }
    },
    {
      "id": "field_8",
      "type": "file",
      "label": "Supporting Documents",
      "required": false,
      "validation": {
        "max_files": 3,
        "max_size_mb": 10,
        "allowed_types": ["pdf", "doc", "docx", "png", "jpg"]
      }
    },
    {
      "id": "field_9",
      "type": "checkbox",
      "label": "I confirm this request is approved by my manager",
      "required": true
    },
    {
      "id": "field_10",
      "type": "number",
      "label": "Quantity",
      "required": true,
      "default": 1,
      "validation": {
        "min": 1,
        "max": 10
      }
    }
  ],
  "sections": [
    {
      "id": "section_1",
      "title": "Hardware Configuration",
      "fields": ["field_1", "field_2"]
    },
    {
      "id": "section_2",
      "title": "Software & Details",
      "fields": ["field_3", "field_4", "field_5"]
    }
  ],
  "conditional_logic": [
    {
      "field": "field_3",
      "show_when": {
        "field": "field_2",
        "operator": "in",
        "value": ["32gb", "64gb"]
      }
    }
  ]
}
```

### Supported Field Types

| Type | Description | Validation Options |
|------|-------------|-------------------|
| `text` | Single-line text | min_length, max_length, pattern (regex) |
| `textarea` | Multi-line text | min_length, max_length |
| `number` | Numeric input | min, max, step |
| `select` | Single dropdown | options[] |
| `multi_select` | Multi-select dropdown | options[], max_selections |
| `radio` | Radio buttons | options[] |
| `checkbox` | Single checkbox | - |
| `checkbox_group` | Multiple checkboxes | options[], min_selected, max_selected |
| `date` | Date picker | min_date, max_date |
| `datetime` | Date and time | min_date, max_date |
| `file` | File upload | max_files, max_size_mb, allowed_types[] |
| `user_picker` | Select user | allow_self, filter_by_group |
| `group_picker` | Select group | filter_by_type |
| `application_picker` | Select application | filter{} |
| `environment_picker` | Select environment | requires_application_field |
| `rich_text` | Rich text editor | max_length |

---

## Technology Stack Recommendations

### Backend
| Component | Primary Choice | Alternative |
|-----------|---------------|-------------|
| API Framework | **Node.js + Fastify** | Go + Fiber |
| Database | **PostgreSQL 15+** | - |
| Cache | **Redis** | - |
| Queue | **BullMQ (Redis)** | RabbitMQ |
| Search | **PostgreSQL FTS** | Elasticsearch (scale) |
| Object Storage | **AWS S3** | MinIO (self-hosted) |

### Frontend
| Component | Choice |
|-----------|--------|
| Framework | **Next.js 14+ (App Router)** |
| UI Library | **shadcn/ui + Tailwind CSS** |
| State | **TanStack Query + Zustand** |
| Forms | **React Hook Form + Zod** |
| Charts | **Recharts** |

### Infrastructure
| Component | Choice |
|-----------|--------|
| Container | **Docker** |
| Orchestration | **Kubernetes (EKS)** |
| CI/CD | **GitHub Actions** |
| Monitoring | **Prometheus + Grafana** |
| Logging | **Loki or CloudWatch** |
| APM | **OpenTelemetry** |

---

## Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Authentication & user management
- [ ] Basic tenant setup
- [ ] Application registry with environments
- [ ] Simple issue tracking (create, assign, resolve)
- [ ] Basic API

### Phase 2: Service Catalog
- [ ] Catalog item builder (form designer)
- [ ] Request workflow
- [ ] Approval chains
- [ ] Bundle support
- [ ] Email notifications

### Phase 3: On-Call & Escalation
- [ ] On-call schedules
- [ ] Rotation management
- [ ] Override handling
- [ ] Escalation policies
- [ ] PagerDuty/Slack integration

### Phase 4: Change Management
- [ ] Change request workflows
- [ ] Change windows
- [ ] Task management
- [ ] Approval workflows
- [ ] CAB support

### Phase 5: Cloud Integration & Scoring
- [ ] AWS integration
- [ ] Resource discovery
- [ ] Cost reporting
- [ ] Health score calculation
- [ ] Dashboard & analytics

### Phase 6: Polish & Scale
- [ ] Advanced reporting
- [ ] Mobile app
- [ ] Additional cloud providers
- [ ] Webhook integrations
- [ ] Public API documentation

---

## Key Differentiators from ServiceNow

| Aspect | ServiceNow | FireLater |
|--------|------------|-----------|
| Setup time | Weeks/months | Hours |
| Learning curve | Steep | Minimal |
| Catalog creation | Complex scripting | Drag-and-drop |
| Pricing | Enterprise ($$$) | SMB-friendly |
| Customization | Extensive but complex | Opinionated, simple |
| Features | 100+ modules | Core 7 modules |
| Target | Enterprise | SMB/Mid-market |

---

## Security Considerations

1. **Data Isolation**: Schema-per-tenant with RLS backup
2. **Encryption**: AES-256 for credentials, TLS 1.3 for transit
3. **Auth**: JWT with short expiry, refresh token rotation
4. **Audit**: Complete audit trail for compliance
5. **SSO**: SAML 2.0 and OIDC support
6. **API Security**: Rate limiting, request signing for webhooks
7. **Compliance**: SOC 2 Type II ready architecture

---

## Naming Notes

- **"Incidents"** → Using **"Issues"** (generic, no trademark concerns)
- **"CMDB"** → Using **"Application Registry"**
- **"Service Catalog"** → Safe to use (generic term)
- **"Change Management"** → Safe to use (ITIL term)

---

## Architecture Review Summary

### Issues Identified and Corrected

1. **Circular Reference Fixed**: `change_requests` referenced `change_windows` before it was defined. Reordered tables so `change_windows` is defined first.

2. **Missing RBAC Schema**: Added complete role-based access control with:
   - `roles` table with system roles (admin, manager, agent, requester)
   - `permissions` table for granular permissions
   - `role_permissions` junction table
   - `user_roles` for user-role assignments

3. **Missing SLA Configuration**: Added comprehensive SLA support:
   - `sla_policies` for defining SLA rules
   - `sla_targets` for priority-specific targets
   - `business_hours` and related tables for business hours calculation
   - `health_score_config` for configurable scoring thresholds

4. **Human-Readable ID Generation**: Added `id_sequences` table and `next_id()` function for generating IDs like `REQ-00001`, `ISS-00001`, `CHG-00001`.

5. **Multi-Tenancy Clarification**:
   - Clarified schema-per-tenant approach
   - `tenants` and `plans` tables in `public` schema
   - All other tables in tenant-specific schemas
   - Removed redundant `tenant_id` columns (not needed with schema-per-tenant)

6. **Missing Indexes**: Added comprehensive indexes for:
   - All foreign key columns
   - Status and priority fields (frequently filtered)
   - Created/updated timestamps (sorting)
   - Partial indexes for common queries (e.g., open issues only)

7. **Enhanced Notification System**:
   - `integrations` table for third-party services
   - `notification_channels` for delivery targets
   - `notification_preferences` with per-event-type settings
   - `user_quiet_hours` for do-not-disturb
   - `webhooks` and `webhook_deliveries` for outbound integrations
   - `notification_templates` for customizable messages

8. **Cloud Integration Enhancements**:
   - `cloud_metrics` table for uptime/availability data
   - `cloud_resource_mapping_rules` for auto-mapping resources to apps
   - Better cost tracking with period-based aggregation
   - Resource lifecycle tracking (first_seen, last_seen, is_deleted)

9. **Form Schema Specification**: Added complete JSON schema specification for catalog item dynamic forms with 15+ field types and conditional logic support.

10. **API Completeness**: Expanded API from ~60 to ~200+ endpoints covering:
    - All CRUD operations
    - State transitions (assign, escalate, resolve, etc.)
    - Nested resources (comments, worklogs, tasks)
    - Reports and analytics
    - Search and audit logs
    - Webhook events

### Additional Improvements

- Added `change_templates` for standard/pre-approved changes
- Added `issue_categories` for hierarchical categorization
- Added `issue_status_history` and `change_status_history` for audit trails
- Added `request_approvals` for multi-step approval chains
- Added `oncall_schedule_applications` to link schedules to apps
- Enhanced health scoring with configurable weights and thresholds
- Added support for shift swaps and overrides in on-call
- Added support for delegated approvals in change management
