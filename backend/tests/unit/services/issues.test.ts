import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Issue Service
 * Testing Incident Management (ITIL) operations
 *
 * Key coverage areas:
 * - Issue CRUD operations with caching
 * - Status transitions with ITIL state machine
 * - Assignment and escalation
 * - Resolution and closure
 * - Comments and worklogs
 * - Problem linking
 * - SLA integration
 */

// Mock dependencies
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/contentSanitization.js', () => ({
  sanitizeMarkdown: vi.fn((content: string) => content),
}));

vi.mock('../../../src/services/dashboard.js', () => ({
  dashboardService: {
    invalidateCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/pagination.js', () => ({
  getOffset: vi.fn((params: { page?: number; perPage?: number }) => ((params.page || 1) - 1) * (params.perPage || 50)),
}));

// Import after mocks
import { issueService, IssueService } from '../../../src/services/issues.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

describe('Issue Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  // ============================================
  // LIST OPERATIONS
  // ============================================
  describe('list', () => {
    it('should list all issues with pagination', async () => {
      // Count query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '100' }] });
      // Issues query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'issue-1',
            issue_number: 'INC-001',
            title: 'Server Down',
            status: 'new',
            priority: 'critical',
            reporter_name: 'John Doe',
          },
          {
            id: 'issue-2',
            issue_number: 'INC-002',
            title: 'Slow Response',
            status: 'assigned',
            priority: 'high',
          },
        ],
      });

      const result = await issueService.list('test-tenant', { page: 1, perPage: 50 });

      expect(result.total).toBe(100);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].title).toBe('Server Down');
      expect(cacheService.getOrSet).toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { status: 'in_progress' });

      expect(mockQuery.mock.calls[0][0]).toContain('i.status = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('in_progress');
    });

    it('should filter by priority', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { priority: 'critical' });

      expect(mockQuery.mock.calls[0][0]).toContain('i.priority = $');
    });

    it('should filter by assignedTo', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { assignedTo: 'user-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('i.assigned_to = $');
    });

    it('should filter by assignedGroup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '8' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { assignedGroup: 'group-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('i.assigned_group = $');
    });

    it('should filter by applicationId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '12' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { applicationId: 'app-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('i.application_id = $');
    });

    it('should filter by reporterId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { reporterId: 'reporter-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('i.reporter_id = $');
    });

    it('should filter by slaBreached', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '4' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { slaBreached: true });

      expect(mockQuery.mock.calls[0][0]).toContain('i.sla_breached = $');
    });

    it('should search across title, issue_number, description', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50 }, { search: 'server' });

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('i.title ILIKE $');
      expect(query).toContain('i.issue_number ILIKE $');
      expect(query).toContain('i.description ILIKE $');
    });

    it('should sort by allowed columns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50, sort: 'priority', order: 'asc' });

      const query = mockQuery.mock.calls[1][0];
      expect(query).toContain('ORDER BY i.priority asc');
    });

    it('should default to created_at desc for invalid sort', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.list('test-tenant', { page: 1, perPage: 50, sort: 'invalid_column' });

      const query = mockQuery.mock.calls[1][0];
      expect(query).toContain('ORDER BY i.created_at desc');
    });
  });

  // ============================================
  // FIND BY ID
  // ============================================
  describe('findById', () => {
    it('should find issue by UUID', async () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: uuid,
          issue_number: 'INC-001',
          title: 'Test Issue',
          status: 'new',
          priority: 'high',
          reporter_name: 'John Doe',
          assignee_name: 'Jane Admin',
        }],
      });

      const result = await issueService.findById('test-tenant', uuid);

      expect(result?.id).toBe(uuid);
      expect(result?.title).toBe('Test Issue');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE i.id = $1'),
        [uuid]
      );
    });

    it('should find issue by issue_number', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'some-uuid',
          issue_number: 'INC-001',
          title: 'Test Issue',
        }],
      });

      const result = await issueService.findById('test-tenant', 'INC-001');

      expect(result?.issue_number).toBe('INC-001');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE i.issue_number = $1'),
        ['INC-001']
      );
    });

    it('should return null if issue not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await issueService.findById('test-tenant', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should include related entity names from joins', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'issue-1',
          reporter_name: 'Reporter User',
          reporter_email: 'reporter@test.com',
          assignee_name: 'Assignee User',
          assignee_email: 'assignee@test.com',
          assigned_group_name: 'IT Support',
          application_name: 'Web App',
          environment_name: 'Production',
          resolver_name: 'Resolver User',
        }],
      });

      const result = await issueService.findById('test-tenant', 'issue-1');

      expect(result?.reporter_name).toBe('Reporter User');
      expect(result?.assignee_name).toBe('Assignee User');
      expect(result?.assigned_group_name).toBe('IT Support');
    });
  });

  // ============================================
  // CREATE ISSUE
  // ============================================
  describe('create', () => {
    beforeEach(() => {
      // Reset client mocks for transaction tests
      mockClientQuery.mockReset();
    });

    it('should create issue with auto-generated number and SLA', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ issue_number: 'INC-001' }] }) // next_id
        .mockResolvedValueOnce({ // SLA query
          rows: [
            { id: 'sla-1', target_minutes: 30, metric_type: 'response_time' },
            { id: 'sla-1', target_minutes: 240, metric_type: 'resolution_time' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'new-issue', issue_number: 'INC-001' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // status history
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // For findById after creation
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-issue', issue_number: 'INC-001', title: 'New Issue' }],
      });

      const result = await issueService.create('test-tenant', {
        title: 'New Issue',
        priority: 'high',
      }, 'reporter-1');

      expect(result.issue_number).toBe('INC-001');
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should throw if issue number generation fails', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // next_id returns empty

      await expect(
        issueService.create('test-tenant', { title: 'Test' }, 'reporter-1')
      ).rejects.toThrow('Failed to generate issue number');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should create issue with all optional fields', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ issue_number: 'INC-002' }] }) // next_id
        .mockResolvedValueOnce({ rows: [] }) // SLA (no matches)
        .mockResolvedValueOnce({ rows: [{ id: 'new-issue' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // status history
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-issue' }] });

      await issueService.create('test-tenant', {
        title: 'Full Issue',
        description: 'Detailed description',
        priority: 'critical',
        severity: 'sev1',
        impact: 'high',
        urgency: 'high',
        categoryId: 'cat-1',
        issueType: 'incident',
        source: 'email',
        applicationId: 'app-1',
        environmentId: 'env-1',
        assignedTo: 'user-1',
        assignedGroup: 'group-1',
      }, 'reporter-1');

      // Verify INSERT was called with all fields
      const insertCall = mockClientQuery.mock.calls[3];
      expect(insertCall[0]).toContain('INSERT INTO tenant_test.issues');
    });

    it('should use default values for optional fields', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ issue_number: 'INC-003' }] }) // next_id
        .mockResolvedValueOnce({ rows: [] }) // SLA
        .mockResolvedValueOnce({ rows: [{ id: 'new-issue' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // status history
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-issue' }] });

      await issueService.create('test-tenant', { title: 'Minimal Issue' }, 'reporter-1');

      const insertCall = mockClientQuery.mock.calls[3];
      const params = insertCall[1];
      expect(params).toContain('medium'); // default priority
      expect(params).toContain('issue'); // default issueType
      expect(params).toContain('portal'); // default source
    });

    it('should rollback on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ issue_number: 'INC-004' }] }) // next_id
        .mockResolvedValueOnce({ rows: [] }) // SLA
        .mockRejectedValueOnce(new Error('Database error')); // INSERT fails

      await expect(
        issueService.create('test-tenant', { title: 'Failing Issue' }, 'reporter-1')
      ).rejects.toThrow('Database error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================
  // UPDATE ISSUE
  // ============================================
  describe('update', () => {
    it('should update issue fields', async () => {
      // findById first
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', issue_number: 'INC-001', title: 'Old Title', status: 'new' }],
      });
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // findById after update
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', title: 'New Title', priority: 'critical' }],
      });

      const result = await issueService.update('test-tenant', 'issue-1', {
        title: 'New Title',
        priority: 'critical',
      }, 'user-1');

      expect(result.title).toBe('New Title');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.issues SET'),
        expect.any(Array)
      );
    });

    it('should throw NotFoundError if issue does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        issueService.update('test-tenant', 'nonexistent', { title: 'Test' }, 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should return existing issue if no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', title: 'Unchanged' }],
      });

      const result = await issueService.update('test-tenant', 'issue-1', {}, 'user-1');

      expect(result.title).toBe('Unchanged');
      // Should only call findById, not UPDATE
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should update all updateable fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.update('test-tenant', 'issue-1', {
        title: 'New Title',
        description: 'New Desc',
        priority: 'high',
        severity: 'sev2',
        impact: 'medium',
        urgency: 'medium',
        categoryId: 'cat-2',
        assignedTo: 'user-2',
        assignedGroup: 'group-2',
        applicationId: 'app-2',
        environmentId: 'env-2',
      }, 'user-1');

      const updateQuery = mockQuery.mock.calls[1][0];
      expect(updateQuery).toContain('title = $1');
      expect(updateQuery).toContain('description = $');
      expect(updateQuery).toContain('priority = $');
    });

    it('should handle null values for nullable fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.update('test-tenant', 'issue-1', {
        assignedTo: null,
        assignedGroup: null,
        applicationId: null,
        environmentId: null,
      }, 'user-1');

      const params = mockQuery.mock.calls[1][1];
      expect(params).toContain(null);
    });
  });

  // ============================================
  // ASSIGN ISSUE
  // ============================================
  describe('assign', () => {
    it('should assign issue to user and group', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'new', first_response_at: null }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] }); // first_response_at update
      mockQuery.mockResolvedValueOnce({ rows: [] }); // status history
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1', status: 'assigned' }] });

      const result = await issueService.assign('test-tenant', 'issue-1', 'user-1', 'group-1', 'admin-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.issues SET assigned_to = $1, assigned_group = $2'),
        ['user-1', 'group-1', 'assigned', 'issue-1']
      );
    });

    it('should change status from new to assigned', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'new', first_response_at: null }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1', status: 'assigned' }] });

      await issueService.assign('test-tenant', 'issue-1', 'user-1', null, 'admin-1');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[1]).toContain('assigned');
    });

    it('should record first response time on first assignment', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'new', first_response_at: null }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE status
      mockQuery.mockResolvedValueOnce({ rows: [] }); // first_response_at UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] }); // status history
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.assign('test-tenant', 'issue-1', 'user-1', null, 'admin-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET first_response_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should not update first_response_at if already set', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'in_progress', first_response_at: new Date() }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.assign('test-tenant', 'issue-1', 'user-2', null, 'admin-1');

      // Should not have first_response_at update query
      const queries = mockQuery.mock.calls.map(c => c[0]);
      expect(queries.filter(q => q.includes('first_response_at = NOW()'))).toHaveLength(0);
    });

    it('should throw NotFoundError if issue does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        issueService.assign('test-tenant', 'nonexistent', 'user-1', null, 'admin-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // CHANGE STATUS
  // ============================================
  describe('changeStatus', () => {
    it('should change status with valid transition', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'new' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] }); // status history
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'in_progress' }],
      });

      const result = await issueService.changeStatus('test-tenant', 'issue-1', 'in_progress', 'user-1');

      expect(result.status).toBe('in_progress');
    });

    it('should record status history with reason', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'in_progress' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.changeStatus('test-tenant', 'issue-1', 'pending', 'user-1', 'Waiting for customer');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.issue_status_history'),
        ['issue-1', 'in_progress', 'pending', 'user-1', 'Waiting for customer']
      );
    });

    it('should throw BadRequestError for invalid transition', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'new' }],
      });

      await expect(
        issueService.changeStatus('test-tenant', 'issue-1', 'resolved', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should allow valid transitions according to state machine', async () => {
      // Test: new -> assigned (valid)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'new' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'assigned' }] });

      await expect(issueService.changeStatus('test-tenant', 'i1', 'assigned', 'u1')).resolves.toBeTruthy();
    });

    it('should allow reopening from closed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'closed' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'in_progress' }] });

      await expect(issueService.changeStatus('test-tenant', 'i1', 'in_progress', 'u1')).resolves.toBeTruthy();
    });

    it('should throw NotFoundError if issue does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        issueService.changeStatus('test-tenant', 'nonexistent', 'in_progress', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // RESOLVE ISSUE
  // ============================================
  describe('resolve', () => {
    it('should resolve issue with resolution code and notes', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'in_progress' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] }); // status history
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'resolved', resolution_code: 'fixed' }],
      });

      const result = await issueService.resolve(
        'test-tenant',
        'issue-1',
        'fixed',
        'Applied hotfix to resolve the issue',
        'resolver-1'
      );

      expect(result.status).toBe('resolved');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'resolved'"),
        expect.arrayContaining(['fixed', 'Applied hotfix to resolve the issue', 'resolver-1', 'issue-1'])
      );
    });

    it('should calculate time_to_resolution', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'in_progress' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.resolve('test-tenant', 'issue-1', 'fixed', 'Fixed', 'resolver-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('time_to_resolution = EXTRACT(EPOCH'),
        expect.any(Array)
      );
    });

    it('should throw BadRequestError if already resolved', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'resolved' }],
      });

      await expect(
        issueService.resolve('test-tenant', 'issue-1', 'fixed', 'Notes', 'user-1')
      ).rejects.toThrow('Issue is already resolved or closed');
    });

    it('should throw BadRequestError if already closed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'closed' }],
      });

      await expect(
        issueService.resolve('test-tenant', 'issue-1', 'fixed', 'Notes', 'user-1')
      ).rejects.toThrow('Issue is already resolved or closed');
    });

    it('should throw NotFoundError if issue does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        issueService.resolve('test-tenant', 'nonexistent', 'fixed', 'Notes', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // CLOSE ISSUE
  // ============================================
  describe('close', () => {
    it('should close issue', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'resolved' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] }); // status history
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', status: 'closed', closed_at: new Date() }],
      });

      const result = await issueService.close('test-tenant', 'issue-1', 'closer-1');

      expect(result.status).toBe('closed');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'closed'"),
        expect.arrayContaining(['closer-1', 'issue-1'])
      );
    });

    it('should record closed_at timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1', status: 'resolved' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.close('test-tenant', 'issue-1', 'closer-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('closed_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should throw NotFoundError if issue does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        issueService.close('test-tenant', 'nonexistent', 'closer-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // ESCALATE
  // ============================================
  describe('escalate', () => {
    it('should increment escalation level', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', escalation_level: 1 }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'issue-1', escalation_level: 2 }],
      });

      const result = await issueService.escalate('test-tenant', 'issue-1', 'user-1');

      expect(result.escalation_level).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('escalation_level = escalation_level + 1'),
        ['issue-1']
      );
    });

    it('should set escalated_at timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1', escalation_level: 0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });

      await issueService.escalate('test-tenant', 'issue-1', 'user-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('escalated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should throw NotFoundError if issue does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        issueService.escalate('test-tenant', 'nonexistent', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // COMMENTS
  // ============================================
  describe('comments', () => {
    describe('getComments', () => {
      it('should get comments for issue', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 'comment-1', content: 'First comment', user_name: 'John', is_internal: false },
            { id: 'comment-2', content: 'Internal note', user_name: 'Admin', is_internal: true },
          ],
        });

        const result = await issueService.getComments('test-tenant', 'issue-1');

        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('First comment');
      });

      it('should return empty array when no comments', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await issueService.getComments('test-tenant', 'issue-1');

        expect(result).toEqual([]);
      });
    });

    describe('addComment', () => {
      it('should add comment to issue', async () => {
        // findById
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
        // INSERT comment
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'new-comment', content: 'Test comment', is_internal: false }],
        });
        // UPDATE issue
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await issueService.addComment('test-tenant', 'issue-1', 'Test comment', 'user-1');

        expect((result as { content: string }).content).toBe('Test comment');
      });

      it('should add internal comment', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'new-comment', is_internal: true }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await issueService.addComment('test-tenant', 'issue-1', 'Internal note', 'user-1', true);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.issue_comments'),
          ['issue-1', 'user-1', 'Internal note', true]
        );
      });

      it('should throw NotFoundError if issue does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          issueService.addComment('test-tenant', 'nonexistent', 'Comment', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  // ============================================
  // WORKLOGS
  // ============================================
  describe('worklogs', () => {
    describe('getWorklogs', () => {
      it('should get worklogs for issue', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 'worklog-1', time_spent: 60, description: 'Investigation', user_name: 'John' },
            { id: 'worklog-2', time_spent: 120, description: 'Fix applied', user_name: 'Jane' },
          ],
        });

        const result = await issueService.getWorklogs('test-tenant', 'issue-1');

        expect(result).toHaveLength(2);
        expect(result[0].time_spent).toBe(60);
      });
    });

    describe('addWorklog', () => {
      it('should add worklog to issue', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'new-worklog', time_spent: 30, description: 'Work done' }],
        });

        const result = await issueService.addWorklog('test-tenant', 'issue-1', 30, 'Work done', 'user-1');

        expect((result as { time_spent: number }).time_spent).toBe(30);
      });

      it('should add billable worklog', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'new-worklog', billable: true }],
        });

        await issueService.addWorklog('test-tenant', 'issue-1', 60, 'Billable work', 'user-1', undefined, true);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.issue_worklogs'),
          expect.arrayContaining([true])
        );
      });

      it('should throw NotFoundError if issue does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          issueService.addWorklog('test-tenant', 'nonexistent', 30, 'Work', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  // ============================================
  // STATUS HISTORY
  // ============================================
  describe('getStatusHistory', () => {
    it('should get status history for issue', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'h1', from_status: null, to_status: 'new', changed_by_name: 'Reporter' },
          { id: 'h2', from_status: 'new', to_status: 'assigned', changed_by_name: 'Admin' },
          { id: 'h3', from_status: 'assigned', to_status: 'in_progress', changed_by_name: 'Assignee' },
        ],
      });

      const result = await issueService.getStatusHistory('test-tenant', 'issue-1');

      expect(result).toHaveLength(3);
      expect(result[0].to_status).toBe('new');
      expect(result[2].to_status).toBe('in_progress');
    });
  });

  // ============================================
  // PROBLEM LINKING
  // ============================================
  describe('problem linking', () => {
    describe('getLinkedProblem', () => {
      it('should get linked problem', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'issue-1', problem_id: 'problem-1' }],
        });
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'problem-1',
            problem_number: 'PRB-001',
            title: 'Root Cause',
            relationship_type: 'caused_by',
            assignee_name: 'Problem Manager',
          }],
        });

        const result = await issueService.getLinkedProblem('test-tenant', 'issue-1');

        expect((result as { problem_number: string }).problem_number).toBe('PRB-001');
      });

      it('should return null if no problem linked', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'issue-1', problem_id: null }],
        });

        const result = await issueService.getLinkedProblem('test-tenant', 'issue-1');

        expect(result).toBeNull();
      });

      it('should throw NotFoundError if issue does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          issueService.getLinkedProblem('test-tenant', 'nonexistent')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('linkToProblem', () => {
      it('should link issue to problem', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] }); // findById
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'problem-1' }] }); // problem check
        mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT problem_issues
        mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE issue
        mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE problem count

        await issueService.linkToProblem('test-tenant', 'issue-1', 'problem-1', 'user-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.problem_issues'),
          expect.arrayContaining(['problem-1', 'issue-1', 'caused_by', 'user-1'])
        );
      });

      it('should link with custom relationship type and notes', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'problem-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await issueService.linkToProblem('test-tenant', 'issue-1', 'problem-1', 'user-1', 'symptom_of', 'Symptom notes');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.problem_issues'),
          expect.arrayContaining(['symptom_of', 'Symptom notes'])
        );
      });

      it('should throw NotFoundError if issue does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          issueService.linkToProblem('test-tenant', 'nonexistent', 'problem-1', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });

      it('should throw NotFoundError if problem does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // problem not found

        await expect(
          issueService.linkToProblem('test-tenant', 'issue-1', 'nonexistent', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('unlinkFromProblem', () => {
      it('should unlink issue from problem', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'issue-1', problem_id: 'problem-1' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
        mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE issue
        mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE problem count

        await issueService.unlinkFromProblem('test-tenant', 'issue-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM tenant_test.problem_issues'),
          ['problem-1', 'issue-1']
        );
      });

      it('should do nothing if no problem linked', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'issue-1', problem_id: null }],
        });

        await issueService.unlinkFromProblem('test-tenant', 'issue-1');

        // Should only call findById, no DELETE
        expect(mockQuery).toHaveBeenCalledTimes(1);
      });

      it('should throw NotFoundError if issue does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          issueService.unlinkFromProblem('test-tenant', 'nonexistent')
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  // ============================================
  // CATEGORIES
  // ============================================
  describe('getCategories', () => {
    it('should get active categories', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'cat-1', name: 'Hardware', is_active: true, sort_order: 1 },
          { id: 'cat-2', name: 'Software', is_active: true, sort_order: 2 },
        ],
      });

      const result = await issueService.getCategories('test-tenant');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Hardware');
    });

    it('should use cache', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await issueService.getCategories('test-tenant');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test-tenant:issues:categories',
        expect.any(Function),
        { ttl: 900 }
      );
    });
  });

  // ============================================
  // SERVICE INSTANCE
  // ============================================
  describe('issueService export', () => {
    it('should be an instance of IssueService', () => {
      expect(issueService).toBeInstanceOf(IssueService);
    });
  });
});
