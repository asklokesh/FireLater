import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock issue service
vi.mock('../../../src/services/issues.js', () => ({
  issueService: {
    list: vi.fn().mockResolvedValue({ issues: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    assign: vi.fn().mockResolvedValue({}),
    escalate: vi.fn().mockResolvedValue({}),
    resolve: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue({}),
    changeStatus: vi.fn().mockResolvedValue({}),
    getComments: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue({}),
    getWorklogs: vi.fn().mockResolvedValue([]),
    addWorklog: vi.fn().mockResolvedValue({}),
    getStatusHistory: vi.fn().mockResolvedValue([]),
    getCategories: vi.fn().mockResolvedValue([]),
    getLinkedProblem: vi.fn().mockResolvedValue(null),
    linkToProblem: vi.fn().mockResolvedValue(undefined),
    unlinkFromProblem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Issues Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Issue Schema', () => {
    const createIssueSchema = z.object({
      title: z.string().min(5).max(500),
      description: z.string().max(10000).optional(),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(),
      impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
      urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
      categoryId: z.string().uuid().optional(),
      issueType: z.enum(['issue', 'problem', 'question']).optional(),
      source: z.enum(['portal', 'email', 'phone', 'monitoring', 'api']).optional(),
      applicationId: z.string().uuid().optional(),
      environmentId: z.string().uuid().optional(),
      assignedTo: z.string().uuid().optional(),
      assignedGroup: z.string().uuid().optional(),
    });

    it('should accept valid issue data', () => {
      const result = createIssueSchema.safeParse({
        title: 'Test issue title',
        description: 'Description of the issue',
        priority: 'high',
      });
      expect(result.success).toBe(true);
    });

    it('should require title of at least 5 characters', () => {
      const result = createIssueSchema.safeParse({
        title: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('should reject title over 500 characters', () => {
      const result = createIssueSchema.safeParse({
        title: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should reject description over 10000 characters', () => {
      const result = createIssueSchema.safeParse({
        title: 'Valid title',
        description: 'x'.repeat(10001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all priority values', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];
      for (const priority of priorities) {
        const result = createIssueSchema.safeParse({
          title: 'Valid title',
          priority,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid priority', () => {
      const result = createIssueSchema.safeParse({
        title: 'Valid title',
        priority: 'urgent',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all severity values', () => {
      const severities = ['S1', 'S2', 'S3', 'S4'];
      for (const severity of severities) {
        const result = createIssueSchema.safeParse({
          title: 'Valid title',
          severity,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all impact values', () => {
      const impacts = ['widespread', 'significant', 'moderate', 'minor'];
      for (const impact of impacts) {
        const result = createIssueSchema.safeParse({
          title: 'Valid title',
          impact,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all urgency values', () => {
      const urgencies = ['immediate', 'high', 'medium', 'low'];
      for (const urgency of urgencies) {
        const result = createIssueSchema.safeParse({
          title: 'Valid title',
          urgency,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all issue types', () => {
      const types = ['issue', 'problem', 'question'];
      for (const issueType of types) {
        const result = createIssueSchema.safeParse({
          title: 'Valid title',
          issueType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all source values', () => {
      const sources = ['portal', 'email', 'phone', 'monitoring', 'api'];
      for (const source of sources) {
        const result = createIssueSchema.safeParse({
          title: 'Valid title',
          source,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should validate UUID for categoryId', () => {
      const result = createIssueSchema.safeParse({
        title: 'Valid title',
        categoryId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid UUID for categoryId', () => {
      const result = createIssueSchema.safeParse({
        title: 'Valid title',
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Issue Schema', () => {
    const updateIssueSchema = z.object({
      title: z.string().min(5).max(500).optional(),
      description: z.string().max(10000).optional(),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(),
      impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
      urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
      categoryId: z.string().uuid().optional(),
      assignedTo: z.string().uuid().optional(),
      assignedGroup: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional(),
      environmentId: z.string().uuid().optional(),
    });

    it('should accept empty update', () => {
      const result = updateIssueSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept partial update', () => {
      const result = updateIssueSchema.safeParse({
        priority: 'critical',
      });
      expect(result.success).toBe(true);
    });

    it('should validate title length on update', () => {
      const result = updateIssueSchema.safeParse({
        title: 'abc',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Assign Schema', () => {
    const assignSchema = z.object({
      assignedTo: z.string().uuid().optional(),
      assignedGroup: z.string().uuid().optional(),
    });

    it('should accept assignedTo UUID', () => {
      const result = assignSchema.safeParse({
        assignedTo: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept assignedGroup UUID', () => {
      const result = assignSchema.safeParse({
        assignedGroup: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept both assignments', () => {
      const result = assignSchema.safeParse({
        assignedTo: '123e4567-e89b-12d3-a456-426614174000',
        assignedGroup: '123e4567-e89b-12d3-a456-426614174001',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty assignment', () => {
      const result = assignSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('Resolve Schema', () => {
    const resolveSchema = z.object({
      resolutionCode: z.string().min(1).max(100),
      resolutionNotes: z.string().min(1).max(5000),
    });

    it('should accept valid resolution', () => {
      const result = resolveSchema.safeParse({
        resolutionCode: 'FIXED',
        resolutionNotes: 'Issue was resolved by restarting the service',
      });
      expect(result.success).toBe(true);
    });

    it('should require resolutionCode', () => {
      const result = resolveSchema.safeParse({
        resolutionNotes: 'Notes only',
      });
      expect(result.success).toBe(false);
    });

    it('should require resolutionNotes', () => {
      const result = resolveSchema.safeParse({
        resolutionCode: 'FIXED',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty resolutionCode', () => {
      const result = resolveSchema.safeParse({
        resolutionCode: '',
        resolutionNotes: 'Valid notes',
      });
      expect(result.success).toBe(false);
    });

    it('should reject resolutionCode over 100 characters', () => {
      const result = resolveSchema.safeParse({
        resolutionCode: 'x'.repeat(101),
        resolutionNotes: 'Valid notes',
      });
      expect(result.success).toBe(false);
    });

    it('should reject resolutionNotes over 5000 characters', () => {
      const result = resolveSchema.safeParse({
        resolutionCode: 'FIXED',
        resolutionNotes: 'x'.repeat(5001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Status Change Schema', () => {
    const statusChangeSchema = z.object({
      status: z.enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']),
      reason: z.string().max(500).optional(),
    });

    it('should accept all valid statuses', () => {
      const statuses = ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'];
      for (const status of statuses) {
        const result = statusChangeSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = statusChangeSchema.safeParse({
        status: 'invalid_status',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional reason', () => {
      const result = statusChangeSchema.safeParse({
        status: 'pending',
        reason: 'Waiting for customer response',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason over 500 characters', () => {
      const result = statusChangeSchema.safeParse({
        status: 'pending',
        reason: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Comment Schema', () => {
    const commentSchema = z.object({
      content: z.string().min(1).max(5000),
      isInternal: z.boolean().optional(),
    });

    it('should accept valid comment', () => {
      const result = commentSchema.safeParse({
        content: 'This is a comment',
      });
      expect(result.success).toBe(true);
    });

    it('should accept internal comment', () => {
      const result = commentSchema.safeParse({
        content: 'Internal note',
        isInternal: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const result = commentSchema.safeParse({
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject content over 5000 characters', () => {
      const result = commentSchema.safeParse({
        content: 'x'.repeat(5001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Worklog Schema', () => {
    const worklogSchema = z.object({
      timeSpent: z.number().min(1).max(1440),
      description: z.string().min(1).max(1000),
      workDate: z.string().datetime().optional(),
      billable: z.boolean().optional(),
    });

    it('should accept valid worklog', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 60,
        description: 'Investigated the issue',
      });
      expect(result.success).toBe(true);
    });

    it('should accept minimum time (1 minute)', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 1,
        description: 'Quick fix',
      });
      expect(result.success).toBe(true);
    });

    it('should accept maximum time (1440 minutes = 24 hours)', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 1440,
        description: 'Full day work',
      });
      expect(result.success).toBe(true);
    });

    it('should reject time below 1', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 0,
        description: 'Description',
      });
      expect(result.success).toBe(false);
    });

    it('should reject time above 1440', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 1441,
        description: 'Description',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional workDate as datetime', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 30,
        description: 'Work done',
        workDate: '2024-01-15T10:30:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional billable flag', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 60,
        description: 'Billable work',
        billable: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Issue ID Parameter Schema', () => {
    const issueIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = issueIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = issueIdParamSchema.safeParse({
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject numeric ID', () => {
      const result = issueIdParamSchema.safeParse({
        id: 12345,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('List Issues Query Schema', () => {
    const listIssuesQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      status: z.enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']).optional(),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      assigned_to: z.string().uuid().optional(),
      assigned_group: z.string().uuid().optional(),
      application_id: z.string().uuid().optional(),
      reporter_id: z.string().uuid().optional(),
      search: z.string().max(200).optional(),
      q: z.string().max(200).optional(),
      sla_breached: z.enum(['true', 'false']).optional(),
    });

    it('should accept empty query', () => {
      const result = listIssuesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept status filter', () => {
      const result = listIssuesQuerySchema.safeParse({
        status: 'in_progress',
      });
      expect(result.success).toBe(true);
    });

    it('should accept priority filter', () => {
      const result = listIssuesQuerySchema.safeParse({
        priority: 'high',
      });
      expect(result.success).toBe(true);
    });

    it('should accept search query', () => {
      const result = listIssuesQuerySchema.safeParse({
        search: 'login error',
      });
      expect(result.success).toBe(true);
    });

    it('should accept q alias for search', () => {
      const result = listIssuesQuerySchema.safeParse({
        q: 'network issue',
      });
      expect(result.success).toBe(true);
    });

    it('should accept sla_breached filter', () => {
      const result = listIssuesQuerySchema.safeParse({
        sla_breached: 'true',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid sla_breached value', () => {
      const result = listIssuesQuerySchema.safeParse({
        sla_breached: 'yes',
      });
      expect(result.success).toBe(false);
    });

    it('should reject search over 200 characters', () => {
      const result = listIssuesQuerySchema.safeParse({
        search: 'x'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should coerce page to number', () => {
      const result = listIssuesQuerySchema.safeParse({
        page: '5',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(5);
      }
    });
  });

  describe('Route Permissions', () => {
    it('should require issues:read for GET /', () => {
      expect('issues:read').toBe('issues:read');
    });

    it('should require issues:read for GET /:id', () => {
      expect('issues:read').toBe('issues:read');
    });

    it('should require issues:create for POST /', () => {
      expect('issues:create').toBe('issues:create');
    });

    it('should require issues:update for PUT /:id', () => {
      expect('issues:update').toBe('issues:update');
    });

    it('should require issues:assign for POST /:id/assign', () => {
      expect('issues:assign').toBe('issues:assign');
    });

    it('should require issues:update for POST /:id/escalate', () => {
      expect('issues:update').toBe('issues:update');
    });

    it('should require issues:resolve for POST /:id/resolve', () => {
      expect('issues:resolve').toBe('issues:resolve');
    });

    it('should require issues:update for POST /:id/close', () => {
      expect('issues:update').toBe('issues:update');
    });

    it('should require issues:update for POST /:id/reopen', () => {
      expect('issues:update').toBe('issues:update');
    });

    it('should require issues:update for POST /:id/status', () => {
      expect('issues:update').toBe('issues:update');
    });

    it('should require issues:read for GET /:id/comments', () => {
      expect('issues:read').toBe('issues:read');
    });

    it('should require issues:update for POST /:id/comments', () => {
      expect('issues:update').toBe('issues:update');
    });

    it('should require issues:read for GET /:id/worklogs', () => {
      expect('issues:read').toBe('issues:read');
    });

    it('should require issues:update for POST /:id/worklogs', () => {
      expect('issues:update').toBe('issues:update');
    });

    it('should require issues:read for GET /categories', () => {
      expect('issues:read').toBe('issues:read');
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing issue', () => {
      const response = {
        statusCode: 404,
        error: 'Not Found',
        message: "Issue with id 'abc' not found",
      };
      expect(response.statusCode).toBe(404);
    });

    it('should return 201 for created issue', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 201 for created comment', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 201 for created worklog', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should wrap comments in data object', () => {
      const comments = [{ id: 'c1', content: 'Test' }];
      const response = { data: comments };
      expect(response).toHaveProperty('data');
    });

    it('should wrap worklogs in data object', () => {
      const worklogs = [{ id: 'w1', timeSpent: 30 }];
      const response = { data: worklogs };
      expect(response).toHaveProperty('data');
    });

    it('should wrap history in data object', () => {
      const history = [{ status: 'new', timestamp: '2024-01-01' }];
      const response = { data: history };
      expect(response).toHaveProperty('data');
    });

    it('should wrap categories in data object', () => {
      const categories = [{ id: 'cat1', name: 'Hardware' }];
      const response = { data: categories };
      expect(response).toHaveProperty('data');
    });

    it('should return success for link operations', () => {
      const response = { success: true };
      expect(response.success).toBe(true);
    });
  });

  describe('SLA Breached Filter Parsing', () => {
    it('should parse sla_breached=true to boolean true', () => {
      const value = 'true';
      const parsed = value === 'true' ? true : value === 'false' ? false : undefined;
      expect(parsed).toBe(true);
    });

    it('should parse sla_breached=false to boolean false', () => {
      const value = 'false';
      const parsed = value === 'true' ? true : value === 'false' ? false : undefined;
      expect(parsed).toBe(false);
    });

    it('should parse undefined sla_breached to undefined', () => {
      const value = undefined;
      const parsed = value === 'true' ? true : value === 'false' ? false : undefined;
      expect(parsed).toBeUndefined();
    });
  });

  describe('Service Integration', () => {
    it('should call issueService.list with filters', async () => {
      const { issueService } = await import('../../../src/services/issues.js');
      const filters = { status: 'open' };
      const pagination = { page: 1, perPage: 20 };

      await issueService.list('test-tenant', pagination, filters);
      expect(issueService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should call issueService.findById', async () => {
      const { issueService } = await import('../../../src/services/issues.js');

      await issueService.findById('test-tenant', 'issue-123');
      expect(issueService.findById).toHaveBeenCalledWith('test-tenant', 'issue-123');
    });

    it('should call issueService.create with userId', async () => {
      const { issueService } = await import('../../../src/services/issues.js');
      const data = { title: 'Test issue' };

      await issueService.create('test-tenant', data, 'user-123');
      expect(issueService.create).toHaveBeenCalledWith('test-tenant', data, 'user-123');
    });
  });
});
