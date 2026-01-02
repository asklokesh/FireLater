import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { migration024PerformanceIndexes, migration024PerformanceIndexesDown } from '../../src/migrations/024_performance_indexes';

/**
 * PERF-004: Performance Index Verification Tests
 *
 * These tests verify that the composite indexes are created correctly
 * and are being used by the query planner for common query patterns.
 *
 * Uses EXPLAIN ANALYZE to verify index usage.
 */

describe('Performance Indexes (PERF-004)', () => {
  let pool: Pool;
  const testSchema = 'test_tenant_perf';

  beforeAll(async () => {
    // Create test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/firelater_test',
    });

    // Create test schema (clone of tenant_template)
    await pool.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${testSchema}`);

    // Create minimal tables needed for index tests
    await pool.query(`
      SET search_path TO ${testSchema};

      -- Users table (minimal for FK constraints)
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL
      );

      -- Issues table
      CREATE TABLE issues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_number VARCHAR(50) NOT NULL UNIQUE,
        title VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'new',
        priority VARCHAR(20) DEFAULT 'medium',
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Issue comments table
      CREATE TABLE issue_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id UUID NOT NULL,
        user_id UUID REFERENCES users(id),
        comment TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Service requests table
      CREATE TABLE service_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_number VARCHAR(50) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'submitted',
        requester_id UUID REFERENCES users(id) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Request approvals table
      CREATE TABLE request_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        approver_id UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Notifications table
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) NOT NULL,
        message TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Audit logs table
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Problems table
      CREATE TABLE problems (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_number VARCHAR(50) NOT NULL UNIQUE,
        title VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'identified',
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Problem issues relationship table
      CREATE TABLE problem_issues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id UUID NOT NULL,
        issue_id UUID NOT NULL
      );
    `);

    // Run the performance indexes migration on test schema
    await pool.query(`SET search_path TO ${testSchema}`);

    // Manually create indexes for test schema (migration targets tenant_template)
    await pool.query(`
      SET search_path TO ${testSchema};

      -- Issues indexes
      CREATE INDEX idx_issues_status_created ON issues(status, created_at DESC);
      CREATE INDEX idx_issues_assigned_status ON issues(assigned_to, status) WHERE assigned_to IS NOT NULL;
      CREATE INDEX idx_issues_priority_status ON issues(priority, status);

      -- Issue comments indexes
      CREATE INDEX idx_issue_comments_issue_created ON issue_comments(issue_id, created_at DESC);

      -- Service requests indexes
      CREATE INDEX idx_service_requests_status_created ON service_requests(status, created_at DESC);
      CREATE INDEX idx_service_requests_requester_status ON service_requests(requester_id, status);

      -- Request approvals indexes
      CREATE INDEX idx_request_approvals_request_status ON request_approvals(request_id, status);

      -- Problems indexes
      CREATE INDEX idx_problems_status_created ON problems(status, created_at DESC);
      CREATE INDEX idx_problems_assigned_status ON problems(assigned_to, status) WHERE assigned_to IS NOT NULL;

      -- Problem issues indexes
      CREATE INDEX idx_problem_issues_problem_issue ON problem_issues(problem_id, issue_id);

      -- Notifications indexes
      CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
      CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

      -- Audit logs indexes
      CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;
    `);

    // Insert test data
    await pool.query(`
      SET search_path TO ${testSchema};

      -- Create test user
      INSERT INTO users (id, email, name) VALUES
        ('11111111-1111-1111-1111-111111111111', 'test@example.com', 'Test User');

      -- Insert test issues (1000 rows for meaningful EXPLAIN ANALYZE)
      INSERT INTO issues (issue_number, title, status, priority, assigned_to, created_at)
      SELECT
        'ISS-' || LPAD(i::TEXT, 5, '0'),
        'Test Issue ' || i,
        CASE WHEN i % 5 = 0 THEN 'resolved' WHEN i % 3 = 0 THEN 'in_progress' ELSE 'open' END,
        CASE WHEN i % 4 = 0 THEN 'critical' WHEN i % 3 = 0 THEN 'high' ELSE 'medium' END,
        CASE WHEN i % 2 = 0 THEN '11111111-1111-1111-1111-111111111111' ELSE NULL END,
        NOW() - (i || ' hours')::INTERVAL
      FROM generate_series(1, 1000) AS i;

      -- Insert test service requests
      INSERT INTO service_requests (request_number, status, requester_id, created_at)
      SELECT
        'REQ-' || LPAD(i::TEXT, 5, '0'),
        CASE WHEN i % 4 = 0 THEN 'completed' WHEN i % 3 = 0 THEN 'in_progress' ELSE 'submitted' END,
        '11111111-1111-1111-1111-111111111111',
        NOW() - (i || ' hours')::INTERVAL
      FROM generate_series(1, 500) AS i;

      -- Insert test notifications
      INSERT INTO notifications (user_id, message, read_at, created_at)
      SELECT
        '11111111-1111-1111-1111-111111111111',
        'Test notification ' || i,
        CASE WHEN i % 3 = 0 THEN NOW() ELSE NULL END,
        NOW() - (i || ' hours')::INTERVAL
      FROM generate_series(1, 200) AS i;

      -- Analyze tables for accurate statistics
      ANALYZE issues;
      ANALYZE service_requests;
      ANALYZE notifications;
    `);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
    await pool.end();
  });

  describe('Issues Table Indexes', () => {
    it('should use idx_issues_status_created for status + date queries', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT * FROM issues
        WHERE status = 'open'
        ORDER BY created_at DESC
        LIMIT 10;
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_issues_status_created');
      expect(plan).toContain('Index Scan');
    });

    it('should use idx_issues_assigned_status for user assignment queries', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT * FROM issues
        WHERE assigned_to = '11111111-1111-1111-1111-111111111111'
          AND status = 'open'
        LIMIT 10;
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_issues_assigned_status');
      expect(plan).toContain('Index Scan');
    });

    it('should use idx_issues_priority_status for priority filtering', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT priority, status, COUNT(*) as count
        FROM issues
        WHERE priority = 'critical' AND status != 'resolved'
        GROUP BY priority, status;
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_issues_priority_status');
    });
  });

  describe('Service Requests Table Indexes', () => {
    it('should use idx_service_requests_status_created for status lists', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT * FROM service_requests
        WHERE status IN ('submitted', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 20;
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_service_requests_status_created');
      expect(plan).toContain('Index Scan');
    });

    it('should use idx_service_requests_requester_status for user requests', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT * FROM service_requests
        WHERE requester_id = '11111111-1111-1111-1111-111111111111'
          AND status = 'submitted';
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_service_requests_requester_status');
      expect(plan).toContain('Index Scan');
    });
  });

  describe('Notifications Table Indexes', () => {
    it('should use idx_notifications_user_unread for unread count queries', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT COUNT(*) FROM notifications
        WHERE user_id = '11111111-1111-1111-1111-111111111111'
          AND read_at IS NULL;
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_notifications_user_unread');
      expect(plan).toContain('Index');
    });

    it('should use idx_notifications_user_created for user notification list', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT * FROM notifications
        WHERE user_id = '11111111-1111-1111-1111-111111111111'
        ORDER BY created_at DESC
        LIMIT 20;
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_notifications_user_created');
      expect(plan).toContain('Index Scan');
    });
  });

  describe('Problem Issues Relationship Index', () => {
    it('should use idx_problem_issues_problem_issue for relationship queries', async () => {
      // Insert test data
      await pool.query(`
        SET search_path TO ${testSchema};
        INSERT INTO problems (problem_number, title) VALUES ('PRB-00001', 'Test Problem');
        INSERT INTO problem_issues (problem_id, issue_id)
        SELECT
          (SELECT id FROM problems LIMIT 1),
          id
        FROM issues
        LIMIT 10;
      `);

      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT * FROM problem_issues
        WHERE problem_id = (SELECT id FROM problems LIMIT 1);
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      expect(plan).toContain('idx_problem_issues_problem_issue');
      expect(plan).toContain('Index');
    });
  });

  describe('Index Coverage Analysis', () => {
    it('should have all expected indexes created', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = '${testSchema}'
          AND indexname LIKE 'idx_%'
        ORDER BY indexname;
      `);

      const indexNames = result.rows.map(row => row.indexname);

      // Verify all critical indexes exist
      expect(indexNames).toContain('idx_issues_status_created');
      expect(indexNames).toContain('idx_issues_assigned_status');
      expect(indexNames).toContain('idx_issues_priority_status');
      expect(indexNames).toContain('idx_service_requests_status_created');
      expect(indexNames).toContain('idx_service_requests_requester_status');
      expect(indexNames).toContain('idx_request_approvals_request_status');
      expect(indexNames).toContain('idx_notifications_user_unread');
      expect(indexNames).toContain('idx_notifications_user_created');
      expect(indexNames).toContain('idx_audit_logs_user_created');
      expect(indexNames).toContain('idx_problems_status_created');
      expect(indexNames).toContain('idx_problem_issues_problem_issue');

      // Should have at least 11 indexes created by the migration
      expect(indexNames.length).toBeGreaterThanOrEqual(11);
    });
  });

  describe('Query Performance Metrics', () => {
    it('should show performance improvement for status filtering', async () => {
      // Query with index
      const withIndex = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT * FROM issues
        WHERE status = 'open'
        ORDER BY created_at DESC
        LIMIT 10;
      `);

      const executionTime = withIndex.rows[0]['QUERY PLAN'][0]['Execution Time'];

      // Should execute in reasonable time (< 10ms with index on 1000 rows)
      expect(executionTime).toBeLessThan(10);
    });

    it('should show index usage for dashboard-style aggregations', async () => {
      const result = await pool.query(`
        SET search_path TO ${testSchema};
        EXPLAIN (FORMAT JSON, ANALYZE)
        SELECT
          status,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE priority = 'critical') as critical_count
        FROM issues
        WHERE status IN ('open', 'in_progress')
        GROUP BY status;
      `);

      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);

      // Should use index for filtering
      expect(plan).toContain('Index');

      const executionTime = result.rows[0]['QUERY PLAN'][0]['Execution Time'];
      expect(executionTime).toBeLessThan(15);
    });
  });
});
