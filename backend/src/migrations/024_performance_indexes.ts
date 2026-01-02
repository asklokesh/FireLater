import { Pool } from 'pg';

/**
 * PERF-004: Add composite indexes for frequently queried field combinations
 *
 * This migration adds performance-optimized composite indexes based on
 * actual query pattern analysis across the codebase.
 *
 * Impact: Significantly reduces query time for:
 * - Dashboard metrics (status + date filtering)
 * - Assignment queries (user + status filtering)
 * - Approval workflows (request + status filtering)
 * - Notification checks (user + read status)
 * - Problem/issue relationship queries
 *
 * See: .loki/memory/learnings/LEARNING-perf-004-database-indexes.md
 */
export async function migration024PerformanceIndexes(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- ============================================
    -- ISSUES TABLE - Composite Indexes
    -- ============================================

    -- Status + created_at for dashboard metrics and list views with pagination
    -- Replaces separate lookups, enables index-only scans
    CREATE INDEX IF NOT EXISTS idx_issues_status_created
      ON issues(status, created_at DESC);

    -- Assigned_to + status for user-specific issue lists (My Issues view)
    -- Critical for assignment workflows
    CREATE INDEX IF NOT EXISTS idx_issues_assigned_status
      ON issues(assigned_to, status) WHERE assigned_to IS NOT NULL;

    -- Priority + status for priority-based filtering and dashboard aggregations
    -- Used in dashboard metrics for priority distribution
    CREATE INDEX IF NOT EXISTS idx_issues_priority_status
      ON issues(priority, status);

    -- Issue_id for comment chronological ordering
    -- Already has single-column index, but composite improves ORDER BY performance
    CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_created
      ON issue_comments(issue_id, created_at DESC);

    -- ============================================
    -- SERVICE REQUESTS TABLE - Composite Indexes
    -- ============================================

    -- Status + created_at for request lists with status filtering and pagination
    -- Most common query pattern in RequestService.list()
    CREATE INDEX IF NOT EXISTS idx_service_requests_status_created
      ON service_requests(status, created_at DESC);

    -- Requester_id + status for user-specific request history
    -- "My Requests" view filtering
    CREATE INDEX IF NOT EXISTS idx_service_requests_requester_status
      ON service_requests(requester_id, status);

    -- Request_approvals: request_id + status for approval workflow checks
    -- Critical performance: runs on every request approval/rejection operation
    CREATE INDEX IF NOT EXISTS idx_request_approvals_request_status
      ON request_approvals(request_id, status);

    -- ============================================
    -- PROBLEMS TABLE - Composite Indexes
    -- ============================================

    -- Check if problems table exists (added in migration 013)
    DO $$
    BEGIN
      IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'tenant_template'
        AND table_name = 'problems'
      ) THEN
        -- Status + created_at for problem lists
        CREATE INDEX IF NOT EXISTS idx_problems_status_created
          ON problems(status, created_at DESC);

        -- Assigned_to + status for user-specific problem lists
        CREATE INDEX IF NOT EXISTS idx_problems_assigned_status
          ON problems(assigned_to, status) WHERE assigned_to IS NOT NULL;
      END IF;
    END $$;

    -- ============================================
    -- PROBLEM-ISSUE RELATIONSHIPS - Composite Index
    -- ============================================

    -- Check if problem_issues table exists
    DO $$
    BEGIN
      IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'tenant_template'
        AND table_name = 'problem_issues'
      ) THEN
        -- Problem_id + issue_id for relationship queries and ON CONFLICT checks
        -- Speeds up linkToProblem, unlinkFromProblem, and count aggregations
        CREATE INDEX IF NOT EXISTS idx_problem_issues_problem_issue
          ON problem_issues(problem_id, issue_id);
      END IF;
    END $$;

    -- ============================================
    -- CHANGE REQUESTS TABLE - Composite Indexes
    -- ============================================

    -- Check if change_requests table exists (added in migration 006)
    DO $$
    BEGIN
      IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'tenant_template'
        AND table_name = 'change_requests'
      ) THEN
        -- Status + created_at for change request lists
        CREATE INDEX IF NOT EXISTS idx_change_requests_status_created
          ON change_requests(status, created_at DESC);
      END IF;
    END $$;

    -- ============================================
    -- NOTIFICATIONS TABLE - Composite Indexes
    -- ============================================

    -- Check if notifications table exists
    DO $$
    BEGIN
      IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'tenant_template'
        AND table_name = 'notifications'
      ) THEN
        -- User_id + read_at for unread notification count
        -- Critical: runs on every user interaction to show unread count
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
          ON notifications(user_id, read_at) WHERE read_at IS NULL;

        -- User_id + created_at for notification list with pagination
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created
          ON notifications(user_id, created_at DESC);
      END IF;
    END $$;

    -- ============================================
    -- AUDIT LOGS TABLE - Composite Indexes
    -- ============================================

    -- User_id + created_at for user activity audit trails
    -- Used in audit queries with date range filtering
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
      ON audit_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;

    -- ============================================
    -- KNOWLEDGE BASE TABLE - Composite Indexes
    -- ============================================

    -- Check if kb_articles table exists (added in migration 014)
    DO $$
    BEGIN
      IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'tenant_template'
        AND table_name = 'kb_articles'
      ) THEN
        -- Category_id + status for knowledge base article filtering
        CREATE INDEX IF NOT EXISTS idx_kb_articles_category_status
          ON kb_articles(category_id, status) WHERE category_id IS NOT NULL;
      END IF;
    END $$;

    -- ============================================
    -- ON-CALL SCHEDULES TABLE - Composite Indexes
    -- ============================================

    -- Check if oncall_schedules table exists (added in migration 005)
    DO $$
    BEGIN
      IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'tenant_template'
        AND table_name = 'oncall_schedules'
      ) THEN
        -- Group_id + is_active for schedule filtering and listing
        CREATE INDEX IF NOT EXISTS idx_oncall_schedules_group_active
          ON oncall_schedules(group_id, is_active) WHERE is_active = true;
      END IF;
    END $$;

    -- ============================================
    -- STATISTICS UPDATE
    -- ============================================

    -- Analyze tables to update statistics for query planner
    -- This ensures PostgreSQL uses the new indexes optimally
    ANALYZE issues;
    ANALYZE issue_comments;
    ANALYZE service_requests;
    ANALYZE request_approvals;
    ANALYZE audit_logs;
  `);

  console.log('[Migration 024] Performance indexes created successfully');
}

/**
 * Rollback function to remove composite indexes
 */
export async function migration024PerformanceIndexesDown(pool: Pool): Promise<void> {
  await pool.query(`
    SET search_path TO tenant_template;

    -- Drop all composite indexes created in this migration
    DROP INDEX IF EXISTS idx_issues_status_created;
    DROP INDEX IF EXISTS idx_issues_assigned_status;
    DROP INDEX IF EXISTS idx_issues_priority_status;
    DROP INDEX IF EXISTS idx_issue_comments_issue_created;

    DROP INDEX IF EXISTS idx_service_requests_status_created;
    DROP INDEX IF EXISTS idx_service_requests_requester_status;
    DROP INDEX IF EXISTS idx_request_approvals_request_status;

    DROP INDEX IF EXISTS idx_problems_status_created;
    DROP INDEX IF EXISTS idx_problems_assigned_status;
    DROP INDEX IF EXISTS idx_problem_issues_problem_issue;

    DROP INDEX IF EXISTS idx_change_requests_status_created;

    DROP INDEX IF EXISTS idx_notifications_user_unread;
    DROP INDEX IF EXISTS idx_notifications_user_created;

    DROP INDEX IF EXISTS idx_audit_logs_user_created;

    DROP INDEX IF EXISTS idx_kb_articles_category_status;

    DROP INDEX IF EXISTS idx_oncall_schedules_group_active;
  `);

  console.log('[Migration 024] Performance indexes rolled back successfully');
}
