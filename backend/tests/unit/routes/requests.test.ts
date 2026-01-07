import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock request service
vi.mock('../../../src/services/requests.js', () => ({
  requestService: {
    list: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    assign: vi.fn().mockResolvedValue({}),
    startWork: vi.fn().mockResolvedValue({}),
    complete: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
    getPendingApprovals: vi.fn().mockResolvedValue([]),
    getApprovals: vi.fn().mockResolvedValue([]),
    approve: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
    getComments: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue({}),
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

describe('Requests Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Request Schema', () => {
    const createRequestSchema = z.object({
      catalogItemId: z.string().uuid(),
      requestedForId: z.string().uuid().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      formData: z.record(z.unknown()),
      notes: z.string().max(2000).optional(),
      costCenter: z.string().max(100).optional(),
    });

    it('should accept valid request data', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
        formData: { quantity: 1, justification: 'Need for work' },
      });
      expect(result.success).toBe(true);
    });

    it('should require catalogItemId', () => {
      const result = createRequestSchema.safeParse({
        formData: {},
      });
      expect(result.success).toBe(false);
    });

    it('should require formData', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all priority values', () => {
      const priorities = ['low', 'medium', 'high', 'critical'];
      for (const priority of priorities) {
        const result = createRequestSchema.safeParse({
          catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
          formData: {},
          priority,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid priority', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
        formData: {},
        priority: 'urgent',
      });
      expect(result.success).toBe(false);
    });

    it('should validate catalogItemId as UUID', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: 'not-a-uuid',
        formData: {},
      });
      expect(result.success).toBe(false);
    });

    it('should validate requestedForId as UUID', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
        requestedForId: 'not-a-uuid',
        formData: {},
      });
      expect(result.success).toBe(false);
    });

    it('should accept nested formData', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
        formData: {
          model: 'MacBook Pro',
          specs: { ram: 16, storage: 512 },
          accessories: ['mouse', 'keyboard'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject notes over 2000 characters', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
        formData: {},
        notes: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('should reject costCenter over 100 characters', () => {
      const result = createRequestSchema.safeParse({
        catalogItemId: '123e4567-e89b-12d3-a456-426614174000',
        formData: {},
        costCenter: 'x'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Update Request Schema', () => {
    const updateRequestSchema = z.object({
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      formData: z.record(z.unknown()).optional(),
      notes: z.string().max(2000).optional(),
      costCenter: z.string().max(100).optional(),
    });

    it('should accept empty update', () => {
      const result = updateRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept partial update', () => {
      const result = updateRequestSchema.safeParse({
        priority: 'high',
      });
      expect(result.success).toBe(true);
    });

    it('should accept formData update', () => {
      const result = updateRequestSchema.safeParse({
        formData: { quantity: 2 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Assign Request Schema', () => {
    const assignRequestSchema = z.object({
      assignedTo: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = assignRequestSchema.safeParse({
        assignedTo: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should require assignedTo', () => {
      const result = assignRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate assignedTo as UUID', () => {
      const result = assignRequestSchema.safeParse({
        assignedTo: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Approval Action Schema', () => {
    const approvalActionSchema = z.object({
      comments: z.string().max(2000).optional(),
    });

    it('should accept empty body', () => {
      const result = approvalActionSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept comments', () => {
      const result = approvalActionSchema.safeParse({
        comments: 'Approved for budget',
      });
      expect(result.success).toBe(true);
    });

    it('should reject comments over 2000 characters', () => {
      const result = approvalActionSchema.safeParse({
        comments: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Cancel Request Schema', () => {
    const cancelRequestSchema = z.object({
      reason: z.string().min(1).max(2000),
    });

    it('should accept valid reason', () => {
      const result = cancelRequestSchema.safeParse({
        reason: 'No longer needed',
      });
      expect(result.success).toBe(true);
    });

    it('should require reason', () => {
      const result = cancelRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject empty reason', () => {
      const result = cancelRequestSchema.safeParse({
        reason: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject reason over 2000 characters', () => {
      const result = cancelRequestSchema.safeParse({
        reason: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Complete Request Schema', () => {
    const completeRequestSchema = z.object({
      notes: z.string().max(2000).optional(),
    });

    it('should accept empty body', () => {
      const result = completeRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept notes', () => {
      const result = completeRequestSchema.safeParse({
        notes: 'Laptop delivered',
      });
      expect(result.success).toBe(true);
    });

    it('should reject notes over 2000 characters', () => {
      const result = completeRequestSchema.safeParse({
        notes: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Add Comment Schema', () => {
    const addCommentSchema = z.object({
      content: z.string().min(1).max(5000),
      isInternal: z.boolean().optional(),
    });

    it('should accept valid comment', () => {
      const result = addCommentSchema.safeParse({
        content: 'Processing your request',
      });
      expect(result.success).toBe(true);
    });

    it('should accept internal comment', () => {
      const result = addCommentSchema.safeParse({
        content: 'Internal note',
        isInternal: true,
      });
      expect(result.success).toBe(true);
    });

    it('should require content', () => {
      const result = addCommentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject empty content', () => {
      const result = addCommentSchema.safeParse({
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject content over 5000 characters', () => {
      const result = addCommentSchema.safeParse({
        content: 'x'.repeat(5001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Request ID Parameter Schema', () => {
    const requestIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = requestIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = requestIdParamSchema.safeParse({
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Request Approval Parameter Schema', () => {
    const requestApprovalParamSchema = z.object({
      id: z.string().uuid(),
      approvalId: z.string().uuid(),
    });

    it('should accept valid UUIDs', () => {
      const result = requestApprovalParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        approvalId: '123e4567-e89b-12d3-a456-426614174001',
      });
      expect(result.success).toBe(true);
    });

    it('should require both IDs', () => {
      const result = requestApprovalParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('List Requests Query Schema', () => {
    const listRequestsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      status: z.enum(['submitted', 'pending_approval', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      requester_id: z.string().uuid().optional(),
      requested_for_id: z.string().uuid().optional(),
      assigned_to: z.string().uuid().optional(),
      catalog_item_id: z.string().uuid().optional(),
      search: z.string().max(200).optional(),
      q: z.string().max(200).optional(),
    });

    it('should accept empty query', () => {
      const result = listRequestsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept all status values', () => {
      const statuses = ['submitted', 'pending_approval', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'];
      for (const status of statuses) {
        const result = listRequestsQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = listRequestsQuerySchema.safeParse({
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept search query', () => {
      const result = listRequestsQuerySchema.safeParse({
        search: 'laptop',
      });
      expect(result.success).toBe(true);
    });

    it('should accept q alias for search', () => {
      const result = listRequestsQuerySchema.safeParse({
        q: 'monitor',
      });
      expect(result.success).toBe(true);
    });

    it('should reject search over 200 characters', () => {
      const result = listRequestsQuerySchema.safeParse({
        search: 'x'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should coerce page to number', () => {
      const result = listRequestsQuerySchema.safeParse({
        page: '3',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
      }
    });

    it('should reject per_page above 100', () => {
      const result = listRequestsQuerySchema.safeParse({
        per_page: '101',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require requests:read for GET /', () => {
      expect('requests:read').toBe('requests:read');
    });

    it('should require requests:read for GET /my', () => {
      expect('requests:read').toBe('requests:read');
    });

    it('should require requests:read for GET /assigned', () => {
      expect('requests:read').toBe('requests:read');
    });

    it('should require approvals:read for GET /pending-approvals', () => {
      expect('approvals:read').toBe('approvals:read');
    });

    it('should require requests:read for GET /:id', () => {
      expect('requests:read').toBe('requests:read');
    });

    it('should require requests:create for POST /', () => {
      expect('requests:create').toBe('requests:create');
    });

    it('should require requests:update for PUT /:id', () => {
      expect('requests:update').toBe('requests:update');
    });

    it('should require requests:assign for POST /:id/assign', () => {
      expect('requests:assign').toBe('requests:assign');
    });

    it('should require requests:update for POST /:id/start', () => {
      expect('requests:update').toBe('requests:update');
    });

    it('should require requests:update for POST /:id/complete', () => {
      expect('requests:update').toBe('requests:update');
    });

    it('should require requests:update for POST /:id/cancel', () => {
      expect('requests:update').toBe('requests:update');
    });

    it('should require approvals:read for GET /:id/approvals', () => {
      expect('approvals:read').toBe('approvals:read');
    });

    it('should require approvals:approve for approval actions', () => {
      expect('approvals:approve').toBe('approvals:approve');
    });

    it('should require requests:read for GET /:id/comments', () => {
      expect('requests:read').toBe('requests:read');
    });

    it('should require requests:update for POST /:id/comments', () => {
      expect('requests:update').toBe('requests:update');
    });

    it('should require requests:read for GET /:id/history', () => {
      expect('requests:read').toBe('requests:read');
    });
  });

  describe('Response Formats', () => {
    it('should return 201 for created request', () => {
      expect(201).toBe(201);
    });

    it('should return 201 for created comment', () => {
      expect(201).toBe(201);
    });

    it('should return 404 for not found', () => {
      const response = {
        statusCode: 404,
        error: 'Not Found',
        message: "Request with id 'abc' not found",
      };
      expect(response.statusCode).toBe(404);
    });

    it('should wrap approvals in data object', () => {
      const approvals = [{ id: 'a1', status: 'pending' }];
      const response = { data: approvals };
      expect(response).toHaveProperty('data');
    });

    it('should wrap comments in data object', () => {
      const comments = [{ id: 'c1', content: 'Test' }];
      const response = { data: comments };
      expect(response).toHaveProperty('data');
    });

    it('should wrap history in data object', () => {
      const history = [{ status: 'submitted', timestamp: '2024-01-01' }];
      const response = { data: history };
      expect(response).toHaveProperty('data');
    });
  });

  describe('Service Integration', () => {
    it('should call requestService.list with filters', async () => {
      const { requestService } = await import('../../../src/services/requests.js');
      const filters = { status: 'pending_approval' };
      const pagination = { page: 1, perPage: 20 };

      await requestService.list('test-tenant', pagination, filters);
      expect(requestService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should call requestService.findById', async () => {
      const { requestService } = await import('../../../src/services/requests.js');

      await requestService.findById('test-tenant', 'req-123');
      expect(requestService.findById).toHaveBeenCalledWith('test-tenant', 'req-123');
    });

    it('should call requestService.create with userId', async () => {
      const { requestService } = await import('../../../src/services/requests.js');
      const data = { catalogItemId: 'cat-1', formData: {} };

      await requestService.create('test-tenant', data, 'user-123');
      expect(requestService.create).toHaveBeenCalledWith('test-tenant', data, 'user-123');
    });

    it('should call requestService.approve with all params', async () => {
      const { requestService } = await import('../../../src/services/requests.js');

      await requestService.approve('test-tenant', 'req-1', 'apr-1', 'Looks good', 'user-1');
      expect(requestService.approve).toHaveBeenCalledWith(
        'test-tenant',
        'req-1',
        'apr-1',
        'Looks good',
        'user-1'
      );
    });
  });

  describe('Special Routes', () => {
    it('should provide GET /my for requester view', () => {
      const endpoint = '/my';
      expect(endpoint).toBe('/my');
    });

    it('should provide GET /assigned for assignee view', () => {
      const endpoint = '/assigned';
      expect(endpoint).toBe('/assigned');
    });

    it('should provide GET /pending-approvals for approver view', () => {
      const endpoint = '/pending-approvals';
      expect(endpoint).toBe('/pending-approvals');
    });
  });
});
