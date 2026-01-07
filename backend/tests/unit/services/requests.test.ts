import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing service
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn(() => ({
  query: mockClientQuery,
  release: mockRelease,
}));

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `tenant_${slug}`,
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn(),
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

vi.mock('../../../src/services/dashboard.js', () => ({
  dashboardService: {
    invalidateCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/contentSanitization.js', () => ({
  sanitizeMarkdown: (content: string) => content,
}));

import { requestService } from '../../../src/services/requests.js';
import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

describe('RequestService', () => {
  const tenantSlug = 'test';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================
  // LIST REQUESTS
  // ==================
  describe('list', () => {
    it('should list requests with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'req-1', request_number: 'REQ-001', status: 'submitted' },
            { id: 'req-2', request_number: 'REQ-002', status: 'in_progress' },
          ],
        });

      const result = await requestService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(10);
      expect(result.requests).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(tenantSlug, { page: 1, perPage: 10 }, { status: 'pending_approval' });

      expect(mockQuery.mock.calls[0][0]).toContain('r.status = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('pending_approval');
    });

    it('should filter by priority', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(tenantSlug, { page: 1, perPage: 10 }, { priority: 'high' });

      expect(mockQuery.mock.calls[0][0]).toContain('r.priority = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('high');
    });

    it('should filter by requesterId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(tenantSlug, { page: 1, perPage: 10 }, { requesterId: 'user-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('r.requester_id = $1');
    });

    it('should filter by requestedForId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(tenantSlug, { page: 1, perPage: 10 }, { requestedForId: 'user-2' });

      expect(mockQuery.mock.calls[0][0]).toContain('r.requested_for_id = $1');
    });

    it('should filter by assignedTo', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '4' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(tenantSlug, { page: 1, perPage: 10 }, { assignedTo: 'user-3' });

      expect(mockQuery.mock.calls[0][0]).toContain('r.assigned_to = $1');
    });

    it('should filter by catalogItemId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '6' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(tenantSlug, { page: 1, perPage: 10 }, { catalogItemId: 'item-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('r.catalog_item_id = $1');
    });

    it('should filter by search term', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(tenantSlug, { page: 1, perPage: 10 }, { search: 'laptop' });

      expect(mockQuery.mock.calls[0][0]).toContain('r.request_number ILIKE $1');
      expect(mockQuery.mock.calls[0][0]).toContain('r.notes ILIKE $1');
      expect(mockQuery.mock.calls[0][1]).toContain('%laptop%');
    });

    it('should combine multiple filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await requestService.list(
        tenantSlug,
        { page: 1, perPage: 10 },
        { status: 'submitted', priority: 'high', requesterId: 'user-1' }
      );

      expect(mockQuery.mock.calls[0][0]).toContain('r.status = $1');
      expect(mockQuery.mock.calls[0][0]).toContain('r.priority = $2');
      expect(mockQuery.mock.calls[0][0]).toContain('r.requester_id = $3');
    });
  });

  // ==================
  // FIND BY ID
  // ==================
  describe('findById', () => {
    it('should find request by UUID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', request_number: 'REQ-001' }],
      });

      const result = await requestService.findById(tenantSlug, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      expect(result).toHaveProperty('request_number', 'REQ-001');
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE r.id = $1');
    });

    it('should find request by request_number', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', request_number: 'REQ-001' }],
      });

      const result = await requestService.findById(tenantSlug, 'REQ-001');

      expect(result).toHaveProperty('request_number', 'REQ-001');
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE r.request_number = $1');
    });

    it('should return null for nonexistent request', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await requestService.findById(tenantSlug, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ==================
  // CREATE REQUEST
  // ==================
  describe('create', () => {
    it('should create request with all fields', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'item-1',
            is_active: true,
            approval_required: false,
            expected_completion_days: 3,
            fulfillment_group_id: 'group-1',
            price: 100,
            cost_center: 'IT',
          }],
        }) // catalog item
        .mockResolvedValueOnce({ rows: [{ request_number: 'REQ-001' }] }) // generate number
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', request_number: 'REQ-001', status: 'submitted' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // status history
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock findById for return value
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', request_number: 'REQ-001', status: 'submitted' }],
      });

      const result = await requestService.create(
        tenantSlug,
        {
          catalogItemId: 'item-1',
          requestedForId: 'user-2',
          priority: 'high',
          formData: { field1: 'value1' },
          notes: 'Test notes',
          costCenter: 'HR',
        },
        'user-1'
      );

      expect(result).toHaveProperty('request_number', 'REQ-001');
      expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
      expect(mockClientQuery.mock.calls[3][0]).toContain('INSERT INTO tenant_test.service_requests');
    });

    it('should create request with pending_approval status when approval required', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'item-1',
            is_active: true,
            approval_required: true,
            approval_group_id: 'approver-group-1',
            expected_completion_days: 5,
            fulfillment_group_id: 'group-1',
            price: 500,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ request_number: 'REQ-002' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'req-2', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [] }) // approval record
        .mockResolvedValueOnce({ rows: [] }) // status history
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-2', status: 'pending_approval' }],
      });

      const result = await requestService.create(
        tenantSlug,
        {
          catalogItemId: 'item-1',
          formData: { field1: 'value1' },
        },
        'user-1'
      );

      expect(result).toHaveProperty('status', 'pending_approval');
      // Check that approval record was created
      expect(mockClientQuery.mock.calls[4][0]).toContain('INSERT INTO tenant_test.request_approvals');
    });

    it('should throw NotFoundError if catalog item not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // catalog item not found

      await expect(
        requestService.create(
          tenantSlug,
          { catalogItemId: 'nonexistent', formData: {} },
          'user-1'
        )
      ).rejects.toThrow(NotFoundError);

      // Should rollback
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should use default priority if not provided', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'item-1',
            is_active: true,
            approval_required: false,
            expected_completion_days: 5,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ request_number: 'REQ-003' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'req-3', priority: 'medium' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-3', priority: 'medium' }],
      });

      const result = await requestService.create(
        tenantSlug,
        { catalogItemId: 'item-1', formData: {} },
        'user-1'
      );

      // Default priority is 'medium'
      expect(mockClientQuery.mock.calls[3][1]).toContain('medium');
    });
  });

  // ==================
  // UPDATE REQUEST
  // ==================
  describe('update', () => {
    it('should update request fields', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'req-1', status: 'submitted' }],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ id: 'req-1', priority: 'high', notes: 'Updated' }],
        });

      const result = await requestService.update(
        tenantSlug,
        'req-1',
        { priority: 'high', notes: 'Updated' },
        'user-1'
      );

      expect(result).toHaveProperty('priority', 'high');
      expect(mockQuery.mock.calls[1][0]).toContain('priority = $1');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        requestService.update(tenantSlug, 'nonexistent', { priority: 'high' }, 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if request is completed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'completed' }],
      });

      await expect(
        requestService.update(tenantSlug, 'req-1', { priority: 'high' }, 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if request is cancelled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'cancelled' }],
      });

      await expect(
        requestService.update(tenantSlug, 'req-1', { notes: 'test' }, 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if request is rejected', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'rejected' }],
      });

      await expect(
        requestService.update(tenantSlug, 'req-1', { notes: 'test' }, 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should return existing if no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'submitted', priority: 'medium' }],
      });

      const result = await requestService.update(tenantSlug, 'req-1', {}, 'user-1');

      expect(result).toHaveProperty('id', 'req-1');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should update formData', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'submitted' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] });

      await requestService.update(
        tenantSlug,
        'req-1',
        { formData: { newField: 'value' } },
        'user-1'
      );

      expect(mockQuery.mock.calls[1][0]).toContain('form_data = $1');
    });
  });

  // ==================
  // ASSIGN REQUEST
  // ==================
  describe('assign', () => {
    it('should assign request to user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'submitted' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', assigned_to: 'user-2' }] });

      const result = await requestService.assign(tenantSlug, 'req-1', 'user-2', 'user-1');

      expect(result).toHaveProperty('assigned_to', 'user-2');
      expect(mockQuery.mock.calls[1][0]).toContain('assigned_to = $1');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        requestService.assign(tenantSlug, 'nonexistent', 'user-2', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==================
  // APPROVE REQUEST
  // ==================
  describe('approve', () => {
    it('should approve request and transition to approved status', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending_approval' }] }) // lock row
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] }) // approval check
        .mockResolvedValueOnce({ rowCount: 1 }) // update approval
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // pending count
        .mockResolvedValueOnce({ rowCount: 1 }) // update request status
        .mockResolvedValueOnce({ rowCount: 1 }) // status history
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'approved' }],
      });

      const result = await requestService.approve(
        tenantSlug,
        'req-1',
        'approval-1',
        'Approved by manager',
        'user-1'
      );

      expect(result).toHaveProperty('status', 'approved');
      expect(mockClientQuery.mock.calls[3][0]).toContain("status = 'approved'");
    });

    it('should keep pending_approval status if more approvals needed', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // still 1 pending
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'pending_approval' }],
      });

      const result = await requestService.approve(
        tenantSlug,
        'req-1',
        'approval-1',
        'Approved first step',
        'user-1'
      );

      expect(result).toHaveProperty('status', 'pending_approval');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // request not found

      await expect(
        requestService.approve(tenantSlug, 'nonexistent', 'approval-1', 'test', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if not pending_approval', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'submitted' }] });

      await expect(
        requestService.approve(tenantSlug, 'req-1', 'approval-1', 'test', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if approval not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [] }); // approval not found

      await expect(
        requestService.approve(tenantSlug, 'req-1', 'nonexistent', 'test', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if approval already processed', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }] }); // already processed

      await expect(
        requestService.approve(tenantSlug, 'req-1', 'approval-1', 'test', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================
  // REJECT REQUEST
  // ==================
  describe('reject', () => {
    it('should reject request', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // update approval
        .mockResolvedValueOnce({ rowCount: 1 }) // update request
        .mockResolvedValueOnce({ rowCount: 1 }) // status history
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'rejected' }],
      });

      const result = await requestService.reject(
        tenantSlug,
        'req-1',
        'approval-1',
        'Budget not available',
        'user-1'
      );

      expect(result).toHaveProperty('status', 'rejected');
    });

    it('should throw BadRequestError if not pending_approval', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'in_progress' }] });

      await expect(
        requestService.reject(tenantSlug, 'req-1', 'approval-1', 'test', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if approval not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [] }); // approval not found

      await expect(
        requestService.reject(tenantSlug, 'req-1', 'nonexistent', 'test', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if approval already processed', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }] }); // already processed

      await expect(
        requestService.reject(tenantSlug, 'req-1', 'approval-1', 'test', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================
  // START WORK
  // ==================
  describe('startWork', () => {
    it('should start work on submitted request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'submitted' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 }) // status history
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'in_progress' }] });

      const result = await requestService.startWork(tenantSlug, 'req-1', 'user-1');

      expect(result).toHaveProperty('status', 'in_progress');
    });

    it('should start work on approved request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'approved' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'in_progress' }] });

      const result = await requestService.startWork(tenantSlug, 'req-1', 'user-1');

      expect(result).toHaveProperty('status', 'in_progress');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(requestService.startWork(tenantSlug, 'nonexistent', 'user-1')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw BadRequestError if request cannot start work', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'in_progress' }],
      });

      await expect(requestService.startWork(tenantSlug, 'req-1', 'user-1')).rejects.toThrow(
        BadRequestError
      );
    });
  });

  // ==================
  // COMPLETE REQUEST
  // ==================
  describe('complete', () => {
    it('should complete in_progress request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'completed' }] });

      const result = await requestService.complete(tenantSlug, 'req-1', 'user-1', 'Work completed');

      expect(result).toHaveProperty('status', 'completed');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(requestService.complete(tenantSlug, 'nonexistent', 'user-1')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw BadRequestError if not in_progress', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'submitted' }],
      });

      await expect(requestService.complete(tenantSlug, 'req-1', 'user-1')).rejects.toThrow(
        BadRequestError
      );
    });
  });

  // ==================
  // CANCEL REQUEST
  // ==================
  describe('cancel', () => {
    it('should cancel submitted request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'submitted' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'cancelled' }] });

      const result = await requestService.cancel(tenantSlug, 'req-1', 'Not needed anymore', 'user-1');

      expect(result).toHaveProperty('status', 'cancelled');
    });

    it('should cancel in_progress request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'cancelled' }] });

      const result = await requestService.cancel(tenantSlug, 'req-1', 'Changed requirements', 'user-1');

      expect(result).toHaveProperty('status', 'cancelled');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        requestService.cancel(tenantSlug, 'nonexistent', 'reason', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if request already completed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'completed' }],
      });

      await expect(
        requestService.cancel(tenantSlug, 'req-1', 'reason', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if request already cancelled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'cancelled' }],
      });

      await expect(
        requestService.cancel(tenantSlug, 'req-1', 'reason', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if request rejected', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'req-1', status: 'rejected' }],
      });

      await expect(
        requestService.cancel(tenantSlug, 'req-1', 'reason', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================
  // APPROVALS
  // ==================
  describe('getPendingApprovals', () => {
    it('should get pending approvals for user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'approval-1', request_number: 'REQ-001', status: 'pending' },
          { id: 'approval-2', request_number: 'REQ-002', status: 'pending' },
        ],
      });

      const result = await requestService.getPendingApprovals(tenantSlug, 'user-1');

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][0]).toContain("ra.status = 'pending'");
    });
  });

  describe('getApprovals', () => {
    it('should get approvals for request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] }) // findById
        .mockResolvedValueOnce({
          rows: [
            { id: 'approval-1', step_number: 1, status: 'approved' },
            { id: 'approval-2', step_number: 2, status: 'pending' },
          ],
        });

      const result = await requestService.getApprovals(tenantSlug, 'req-1');

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY ra.step_number');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(requestService.getApprovals(tenantSlug, 'nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ==================
  // COMMENTS
  // ==================
  describe('getComments', () => {
    it('should get comments for request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'comment-1', content: 'First comment' },
            { id: 'comment-2', content: 'Second comment' },
          ],
        });

      const result = await requestService.getComments(tenantSlug, 'req-1');

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY c.created_at');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(requestService.getComments(tenantSlug, 'nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('addComment', () => {
    it('should add comment to request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'comment-1', content: 'Test comment' }] })
        .mockResolvedValueOnce({ rowCount: 1 }); // update request updated_at

      const result = await requestService.addComment(tenantSlug, 'req-1', 'Test comment', 'user-1');

      expect(result).toHaveProperty('content', 'Test comment');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO tenant_test.request_comments');
    });

    it('should add internal comment', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'comment-1', is_internal: true }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await requestService.addComment(
        tenantSlug,
        'req-1',
        'Internal note',
        'user-1',
        true
      );

      expect(result).toHaveProperty('is_internal', true);
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        requestService.addComment(tenantSlug, 'nonexistent', 'test', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==================
  // DELEGATE APPROVAL
  // ==================
  describe('delegateApproval', () => {
    it('should delegate approval to another user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] }) // findById
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1', status: 'pending' }] }) // approval check
        .mockResolvedValueOnce({ rows: [{ id: 'user-2', name: 'Jane', email: 'jane@test.com', status: 'active' }] }) // delegate user
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1', status: 'delegated' }] }) // update approval
        .mockResolvedValueOnce({ rowCount: 1 }) // create new approval
        .mockResolvedValueOnce({ rowCount: 1 }); // log activity

      const result = await requestService.delegateApproval(
        tenantSlug,
        'req-1',
        'approval-1',
        'user-2',
        'Out of office',
        'user-1'
      );

      expect(result).toHaveProperty('status', 'delegated');
      expect(result).toHaveProperty('delegated_to_name', 'Jane');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        requestService.delegateApproval(tenantSlug, 'nonexistent', 'approval-1', 'user-2', 'reason', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if approval not found or not authorized', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] })
        .mockResolvedValueOnce({ rows: [] }); // approval not found

      await expect(
        requestService.delegateApproval(tenantSlug, 'req-1', 'nonexistent', 'user-2', 'reason', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if delegate user not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'approval-1', status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] }); // delegate user not found

      await expect(
        requestService.delegateApproval(tenantSlug, 'req-1', 'approval-1', 'nonexistent', 'reason', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==================
  // STATUS HISTORY
  // ==================
  describe('getStatusHistory', () => {
    it('should get status history for request', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] })
        .mockResolvedValueOnce({
          rows: [
            { from_status: null, to_status: 'submitted' },
            { from_status: 'submitted', to_status: 'in_progress' },
            { from_status: 'in_progress', to_status: 'completed' },
          ],
        });

      const result = await requestService.getStatusHistory(tenantSlug, 'req-1');

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY h.created_at');
    });

    it('should throw NotFoundError if request not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(requestService.getStatusHistory(tenantSlug, 'nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
