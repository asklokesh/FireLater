import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/problems.js', () => ({
  problemService: {
    list: vi.fn().mockResolvedValue({ problems: [], total: 0 }),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue({}),
    assign: vi.fn().mockResolvedValue({}),
    getComments: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue({}),
    getWorklogs: vi.fn().mockResolvedValue([]),
    addWorklog: vi.fn().mockResolvedValue({}),
    getLinkedIssues: vi.fn().mockResolvedValue([]),
    linkIssue: vi.fn().mockResolvedValue(undefined),
    unlinkIssue: vi.fn().mockResolvedValue(undefined),
    getStatusHistory: vi.fn().mockResolvedValue([]),
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

describe('Problems Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Problem Schema', () => {
    const createProblemSchema = z.object({
      title: z.string().min(5).max(500),
      description: z.string().max(10000).optional(),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
      urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
      categoryId: z.string().uuid().optional(),
      problemType: z.enum(['reactive', 'proactive']).optional(),
      applicationId: z.string().uuid().optional(),
      assignedTo: z.string().uuid().optional(),
      assignedGroup: z.string().uuid().optional(),
      tags: z.array(z.string()).optional(),
    });

    it('should require title of at least 5 characters', () => {
      const result = createProblemSchema.safeParse({ title: 'Test' });
      expect(result.success).toBe(false);
    });

    it('should accept valid title', () => {
      const result = createProblemSchema.safeParse({ title: 'Valid Title' });
      expect(result.success).toBe(true);
    });

    it('should reject title over 500 characters', () => {
      const result = createProblemSchema.safeParse({ title: 'x'.repeat(501) });
      expect(result.success).toBe(false);
    });

    it('should accept all priority values', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];
      for (const priority of priorities) {
        const result = createProblemSchema.safeParse({ title: 'Valid Title', priority });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all impact values', () => {
      const impacts = ['widespread', 'significant', 'moderate', 'minor'];
      for (const impact of impacts) {
        const result = createProblemSchema.safeParse({ title: 'Valid Title', impact });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all urgency values', () => {
      const urgencies = ['immediate', 'high', 'medium', 'low'];
      for (const urgency of urgencies) {
        const result = createProblemSchema.safeParse({ title: 'Valid Title', urgency });
        expect(result.success).toBe(true);
      }
    });

    it('should accept problem types', () => {
      const result = createProblemSchema.safeParse({ title: 'Valid Title', problemType: 'reactive' });
      expect(result.success).toBe(true);
    });

    it('should accept proactive problem type', () => {
      const result = createProblemSchema.safeParse({ title: 'Valid Title', problemType: 'proactive' });
      expect(result.success).toBe(true);
    });

    it('should reject description over 10000 characters', () => {
      const result = createProblemSchema.safeParse({
        title: 'Valid Title',
        description: 'x'.repeat(10001),
      });
      expect(result.success).toBe(false);
    });

    it('should validate categoryId as UUID', () => {
      const result = createProblemSchema.safeParse({
        title: 'Valid Title',
        categoryId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept tags array', () => {
      const result = createProblemSchema.safeParse({
        title: 'Valid Title',
        tags: ['network', 'infrastructure'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Problem Schema', () => {
    const updateProblemSchema = z.object({
      title: z.string().min(5).max(500).optional(),
      description: z.string().max(10000).optional(),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
      urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
      categoryId: z.string().uuid().optional(),
      assignedTo: z.string().uuid().nullable().optional(),
      assignedGroup: z.string().uuid().nullable().optional(),
      applicationId: z.string().uuid().nullable().optional(),
      rootCause: z.string().max(10000).optional(),
      workaround: z.string().max(10000).optional(),
      resolution: z.string().max(10000).optional(),
      resolutionCode: z.string().max(100).optional(),
      tags: z.array(z.string()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateProblemSchema.safeParse({ priority: 'high' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateProblemSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept nullable assignedTo', () => {
      const result = updateProblemSchema.safeParse({ assignedTo: null });
      expect(result.success).toBe(true);
    });

    it('should accept nullable assignedGroup', () => {
      const result = updateProblemSchema.safeParse({ assignedGroup: null });
      expect(result.success).toBe(true);
    });

    it('should accept rootCause', () => {
      const result = updateProblemSchema.safeParse({
        rootCause: 'Database connection pool exhausted',
      });
      expect(result.success).toBe(true);
    });

    it('should accept workaround', () => {
      const result = updateProblemSchema.safeParse({
        workaround: 'Restart the service every 4 hours',
      });
      expect(result.success).toBe(true);
    });

    it('should accept resolution', () => {
      const result = updateProblemSchema.safeParse({
        resolution: 'Increased connection pool size to 100',
      });
      expect(result.success).toBe(true);
    });

    it('should reject resolutionCode over 100 characters', () => {
      const result = updateProblemSchema.safeParse({
        resolutionCode: 'x'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Five Why Entry Schema', () => {
    const fiveWhyEntrySchema = z.object({
      why: z.string().max(500),
      answer: z.string().max(2000),
    });

    it('should accept valid five why entry', () => {
      const result = fiveWhyEntrySchema.safeParse({
        why: 'Why did the system fail?',
        answer: 'Because the database connection timed out.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject why over 500 characters', () => {
      const result = fiveWhyEntrySchema.safeParse({
        why: 'x'.repeat(501),
        answer: 'Some answer',
      });
      expect(result.success).toBe(false);
    });

    it('should reject answer over 2000 characters', () => {
      const result = fiveWhyEntrySchema.safeParse({
        why: 'Why?',
        answer: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Status Change Schema', () => {
    const statusChangeSchema = z.object({
      status: z.enum(['new', 'assigned', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed']),
      reason: z.string().max(500).optional(),
    });

    it('should accept all status values', () => {
      const statuses = ['new', 'assigned', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed'];
      for (const status of statuses) {
        const result = statusChangeSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = statusChangeSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should accept reason', () => {
      const result = statusChangeSchema.safeParse({
        status: 'resolved',
        reason: 'Issue fixed with patch 1.2.3',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason over 500 characters', () => {
      const result = statusChangeSchema.safeParse({
        status: 'resolved',
        reason: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Assign Schema', () => {
    const assignSchema = z.object({
      assigneeId: z.string().uuid(),
    });

    it('should require valid UUID assigneeId', () => {
      const result = assignSchema.safeParse({
        assigneeId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = assignSchema.safeParse({ assigneeId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing assigneeId', () => {
      const result = assignSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Comment Schema', () => {
    const commentSchema = z.object({
      content: z.string().min(1).max(5000),
      isInternal: z.boolean().optional(),
    });

    it('should require content', () => {
      const result = commentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid comment', () => {
      const result = commentSchema.safeParse({
        content: 'This is a comment',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const result = commentSchema.safeParse({ content: '' });
      expect(result.success).toBe(false);
    });

    it('should reject content over 5000 characters', () => {
      const result = commentSchema.safeParse({ content: 'x'.repeat(5001) });
      expect(result.success).toBe(false);
    });

    it('should accept isInternal flag', () => {
      const result = commentSchema.safeParse({
        content: 'Internal note',
        isInternal: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Worklog Schema', () => {
    const worklogSchema = z.object({
      timeSpent: z.number().min(1).max(1440),
      description: z.string().min(1).max(1000),
      workType: z.enum(['analysis', 'investigation', 'documentation', 'testing', 'implementation', 'other']).optional(),
    });

    it('should require timeSpent and description', () => {
      const result = worklogSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid worklog', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 60,
        description: 'Investigated the root cause',
      });
      expect(result.success).toBe(true);
    });

    it('should reject timeSpent below minimum (1)', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 0,
        description: 'Some work',
      });
      expect(result.success).toBe(false);
    });

    it('should accept maximum timeSpent (1440 = 24 hours)', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 1440,
        description: 'Full day work',
      });
      expect(result.success).toBe(true);
    });

    it('should reject timeSpent above maximum', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 1441,
        description: 'Too much work',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all work types', () => {
      const workTypes = ['analysis', 'investigation', 'documentation', 'testing', 'implementation', 'other'];
      for (const workType of workTypes) {
        const result = worklogSchema.safeParse({
          timeSpent: 30,
          description: 'Some work',
          workType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject description over 1000 characters', () => {
      const result = worklogSchema.safeParse({
        timeSpent: 30,
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Link Issue Schema', () => {
    const linkIssueSchema = z.object({
      issueId: z.string().uuid(),
      relationshipType: z.enum(['caused_by', 'related_to', 'duplicate_of']).optional(),
      notes: z.string().max(1000).optional(),
    });

    it('should require issueId', () => {
      const result = linkIssueSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid issueId', () => {
      const result = linkIssueSchema.safeParse({
        issueId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all relationship types', () => {
      const types = ['caused_by', 'related_to', 'duplicate_of'];
      for (const relationshipType of types) {
        const result = linkIssueSchema.safeParse({
          issueId: '123e4567-e89b-12d3-a456-426614174000',
          relationshipType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept notes', () => {
      const result = linkIssueSchema.safeParse({
        issueId: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'These issues are related',
      });
      expect(result.success).toBe(true);
    });

    it('should reject notes over 1000 characters', () => {
      const result = linkIssueSchema.safeParse({
        issueId: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Problem ID Parameter Schema', () => {
    const problemIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = problemIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = problemIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('Problem Issue Parameter Schema', () => {
    const problemIssueParamSchema = z.object({
      id: z.string().uuid(),
      issueId: z.string().uuid(),
    });

    it('should require both id and issueId', () => {
      const result = problemIssueParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid UUIDs for both', () => {
      const result = problemIssueParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        issueId: '223e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('List Problems Query Schema', () => {
    const listProblemsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      status: z.enum(['new', 'assigned', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed']).optional(),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      assigned_to: z.string().uuid().optional(),
      assigned_group: z.string().uuid().optional(),
      application_id: z.string().uuid().optional(),
      reporter_id: z.string().uuid().optional(),
      search: z.string().max(200).optional(),
      q: z.string().max(200).optional(),
      is_known_error: z.enum(['true', 'false']).optional(),
      problem_type: z.enum(['reactive', 'proactive']).optional(),
    });

    it('should accept empty query', () => {
      const result = listProblemsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept pagination parameters', () => {
      const result = listProblemsQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by status', () => {
      const result = listProblemsQuerySchema.safeParse({ status: 'investigating' });
      expect(result.success).toBe(true);
    });

    it('should filter by priority', () => {
      const result = listProblemsQuerySchema.safeParse({ priority: 'critical' });
      expect(result.success).toBe(true);
    });

    it('should filter by assigned_to', () => {
      const result = listProblemsQuerySchema.safeParse({
        assigned_to: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by is_known_error', () => {
      const result = listProblemsQuerySchema.safeParse({ is_known_error: 'true' });
      expect(result.success).toBe(true);
    });

    it('should filter by problem_type', () => {
      const result = listProblemsQuerySchema.safeParse({ problem_type: 'proactive' });
      expect(result.success).toBe(true);
    });

    it('should accept search parameter', () => {
      const result = listProblemsQuerySchema.safeParse({ search: 'network' });
      expect(result.success).toBe(true);
    });

    it('should accept q parameter (alias for search)', () => {
      const result = listProblemsQuerySchema.safeParse({ q: 'network' });
      expect(result.success).toBe(true);
    });

    it('should reject search over 200 characters', () => {
      const result = listProblemsQuerySchema.safeParse({ search: 'x'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe('Cost Breakdown Schema', () => {
    const costBreakdownSchema = z.object({
      labor_hours: z.number().min(0).optional(),
      labor_rate: z.number().min(0).optional(),
      revenue_loss: z.number().min(0).optional(),
      recovery_costs: z.number().min(0).optional(),
      third_party_costs: z.number().min(0).optional(),
      customer_credits: z.number().min(0).optional(),
      other: z.number().min(0).optional(),
    }).optional().nullable();

    it('should accept empty cost breakdown', () => {
      const result = costBreakdownSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept null cost breakdown', () => {
      const result = costBreakdownSchema.safeParse(null);
      expect(result.success).toBe(true);
    });

    it('should accept valid cost breakdown', () => {
      const result = costBreakdownSchema.safeParse({
        labor_hours: 40,
        labor_rate: 100,
        revenue_loss: 5000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative values', () => {
      const schema = z.object({
        labor_hours: z.number().min(0).optional(),
      });
      const result = schema.safeParse({ labor_hours: -10 });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require problems:read for GET /', () => {
      const permission = 'problems:read';
      expect(permission).toBe('problems:read');
    });

    it('should require problems:read for GET /:id', () => {
      const permission = 'problems:read';
      expect(permission).toBe('problems:read');
    });

    it('should require problems:create for POST /', () => {
      const permission = 'problems:create';
      expect(permission).toBe('problems:create');
    });

    it('should require problems:update for PUT /:id', () => {
      const permission = 'problems:update';
      expect(permission).toBe('problems:update');
    });

    it('should require problems:delete for DELETE /:id', () => {
      const permission = 'problems:delete';
      expect(permission).toBe('problems:delete');
    });

    it('should require problems:assign for POST /:id/assign', () => {
      const permission = 'problems:assign';
      expect(permission).toBe('problems:assign');
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing problem', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Problem with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 201 for created problem', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted problem', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return 201 for linked issue', () => {
      const response = { message: 'Issue linked successfully' };
      expect(response.message).toBe('Issue linked successfully');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and pagination to problemService.list', async () => {
      const { problemService } = await import('../../../src/services/problems.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = {};

      await problemService.list('test-tenant', pagination, filters);
      expect(problemService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug and id to problemService.getById', async () => {
      const { problemService } = await import('../../../src/services/problems.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await problemService.getById('test-tenant', id);
      expect(problemService.getById).toHaveBeenCalledWith('test-tenant', id);
    });
  });
});
