import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for ShiftSwapService
 * Testing shift swap request lifecycle, validation, and authorization
 *
 * Key coverage areas:
 * - Shift swap CRUD operations
 * - Swap workflow (create, accept, reject, cancel, complete)
 * - Authorization (owner-only operations, offered-to-user validation)
 * - Expiration handling
 * - Admin approval
 */

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../../../src/services/oncall.js', () => ({
  oncallScheduleService: {
    findById: vi.fn(),
    createOverride: vi.fn().mockResolvedValue({ id: 'override-1' }),
  },
}));

vi.mock('../../../src/services/notification-delivery.js', () => ({
  notificationDeliveryService: {
    deliver: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../../src/utils/pagination.js', () => ({
  getOffset: vi.fn((params: { page: number; perPage: number }) => (params.page - 1) * params.perPage),
}));

// Import after mocks
import { shiftSwapService } from '../../../src/services/shiftSwaps.js';
import { oncallScheduleService } from '../../../src/services/oncall.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../../src/utils/errors.js';

describe('ShiftSwapService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // LIST OPERATIONS
  // ============================================
  describe('list', () => {
    it('should list shift swaps with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'swap-1', swap_number: 'SWAP-001', status: 'pending', requester_name: 'John' },
            { id: 'swap-2', swap_number: 'SWAP-002', status: 'accepted', requester_name: 'Jane' },
          ],
        });

      const result = await shiftSwapService.list(
        'test-tenant',
        { page: 1, perPage: 10 }
      );

      expect(result.total).toBe(10);
      expect(result.swaps).toHaveLength(2);
      expect(cacheService.getOrSet).toHaveBeenCalled();
    });

    it('should filter by scheduleId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await shiftSwapService.list(
        'test-tenant',
        { page: 1, perPage: 10 },
        { scheduleId: 'schedule-1' }
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('schedule_id = $1'),
        expect.arrayContaining(['schedule-1'])
      );
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await shiftSwapService.list(
        'test-tenant',
        { page: 1, perPage: 10 },
        { status: 'pending' }
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        expect.arrayContaining(['pending'])
      );
    });

    it('should filter by requesterId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await shiftSwapService.list(
        'test-tenant',
        { page: 1, perPage: 10 },
        { requesterId: 'user-1' }
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('requester_id = $1'),
        expect.arrayContaining(['user-1'])
      );
    });

    it('should filter by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await shiftSwapService.list(
        'test-tenant',
        { page: 1, perPage: 10 },
        { fromDate: '2025-01-01', toDate: '2025-01-31' }
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('original_start >= $'),
        expect.arrayContaining(['2025-01-01', '2025-01-31'])
      );
    });
  });

  describe('getById', () => {
    it('should get swap by UUID', async () => {
      const mockSwap = {
        id: 'swap-uuid',
        swap_number: 'SWAP-001',
        status: 'pending',
        requester_name: 'John Doe',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockSwap] });

      const result = await shiftSwapService.getById('test-tenant', 'swap-uuid');

      expect(result).toEqual(mockSwap);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.id = $1'),
        ['swap-uuid']
      );
    });

    it('should get swap by swap_number', async () => {
      const mockSwap = { id: 'swap-uuid', swap_number: 'SWAP-001' };
      mockQuery.mockResolvedValueOnce({ rows: [mockSwap] });

      const result = await shiftSwapService.getById('test-tenant', 'SWAP-001');

      expect(result).toEqual(mockSwap);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.swap_number = $1'),
        ['SWAP-001']
      );
    });

    it('should throw NotFoundError if swap not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        shiftSwapService.getById('test-tenant', 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getMyRequests', () => {
    it('should get swaps requested by user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'swap-1', requester_id: 'user-1' },
          { id: 'swap-2', requester_id: 'user-1' },
        ],
      });

      const result = await shiftSwapService.getMyRequests('test-tenant', 'user-1');

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('requester_id = $1'),
        ['user-1']
      );
    });
  });

  describe('getAvailableToAccept', () => {
    it('should get pending swaps available to user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'swap-1', offered_to_user_id: 'user-1' },
          { id: 'swap-2', offered_to_user_id: null },
        ],
      });

      const result = await shiftSwapService.getAvailableToAccept('test-tenant', 'user-1');

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending'"),
        ['user-1']
      );
    });
  });

  // ============================================
  // CREATE
  // ============================================
  describe('create', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const futureEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // Day after tomorrow

    beforeEach(() => {
      vi.mocked(oncallScheduleService.findById).mockResolvedValue({
        id: 'schedule-1',
        name: 'Primary On-Call',
      });
    });

    it('should create a swap request', async () => {
      // Rotation check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });
      // Generate swap number
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'SWAP-001' }] });
      // INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', swap_number: 'SWAP-001', status: 'pending' }],
      });
      // getById return
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', swap_number: 'SWAP-001' }],
      });

      const result = await shiftSwapService.create(
        'test-tenant',
        'user-1',
        {
          scheduleId: 'schedule-1',
          originalStart: futureDate.toISOString(),
          originalEnd: futureEndDate.toISOString(),
        }
      );

      expect(result.swap_number).toBe('SWAP-001');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'shiftswaps');
    });

    it('should throw NotFoundError if schedule does not exist', async () => {
      vi.mocked(oncallScheduleService.findById).mockResolvedValue(null);

      await expect(
        shiftSwapService.create('test-tenant', 'user-1', {
          scheduleId: 'nonexistent',
          originalStart: futureDate.toISOString(),
          originalEnd: futureEndDate.toISOString(),
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if requester not in rotation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Rotation check fails

      await expect(
        shiftSwapService.create('test-tenant', 'user-1', {
          scheduleId: 'schedule-1',
          originalStart: futureDate.toISOString(),
          originalEnd: futureEndDate.toISOString(),
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if end time before start time', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });

      await expect(
        shiftSwapService.create('test-tenant', 'user-1', {
          scheduleId: 'schedule-1',
          originalStart: futureEndDate.toISOString(), // Later
          originalEnd: futureDate.toISOString(), // Earlier
        })
      ).rejects.toThrow('End time must be after start time');
    });

    it('should throw BadRequestError if shift already started', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await expect(
        shiftSwapService.create('test-tenant', 'user-1', {
          scheduleId: 'schedule-1',
          originalStart: pastDate.toISOString(),
          originalEnd: futureDate.toISOString(),
        })
      ).rejects.toThrow('Cannot request swap for a shift that has already started');
    });

    it('should validate offered user is in rotation', async () => {
      // Requester rotation check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });
      // Offered user rotation check fails
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        shiftSwapService.create('test-tenant', 'user-1', {
          scheduleId: 'schedule-1',
          originalStart: futureDate.toISOString(),
          originalEnd: futureEndDate.toISOString(),
          offeredToUserId: 'user-2',
        })
      ).rejects.toThrow('Offered user must be in the schedule rotation');
    });

    it('should throw BadRequestError if offering to self', async () => {
      // Requester rotation check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });
      // Offered user rotation check (same user)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });

      await expect(
        shiftSwapService.create('test-tenant', 'user-1', {
          scheduleId: 'schedule-1',
          originalStart: futureDate.toISOString(),
          originalEnd: futureEndDate.toISOString(),
          offeredToUserId: 'user-1', // Self
        })
      ).rejects.toThrow('Cannot offer swap to yourself');
    });
  });

  // ============================================
  // UPDATE
  // ============================================
  describe('update', () => {
    it('should update swap request', async () => {
      // getSwapById
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          schedule_id: 'schedule-1',
        }],
      });
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // getById return
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', reason: 'Updated reason' }],
      });

      const result = await shiftSwapService.update(
        'test-tenant',
        'swap-1',
        'user-1',
        { reason: 'Updated reason' }
      );

      expect(result.reason).toBe('Updated reason');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'shiftswaps');
    });

    it('should throw ForbiddenError if not owner', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-2', status: 'pending' }],
      });

      await expect(
        shiftSwapService.update('test-tenant', 'swap-1', 'user-1', { reason: 'New' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw BadRequestError if not pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-1', status: 'accepted' }],
      });

      await expect(
        shiftSwapService.update('test-tenant', 'swap-1', 'user-1', { reason: 'New' })
      ).rejects.toThrow(BadRequestError);
    });

    it('should return current swap if no updates', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-1', status: 'pending' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1' }],
      });

      await shiftSwapService.update('test-tenant', 'swap-1', 'user-1', {});

      // Should call getById, not UPDATE
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // CANCEL
  // ============================================
  describe('cancel', () => {
    it('should cancel own pending request', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-1', status: 'pending' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'cancelled' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'cancelled' }],
      });

      const result = await shiftSwapService.cancel('test-tenant', 'swap-1', 'user-1');

      expect(result.status).toBe('cancelled');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'shiftswaps');
    });

    it('should throw ForbiddenError if not owner', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-2', status: 'pending' }],
      });

      await expect(
        shiftSwapService.cancel('test-tenant', 'swap-1', 'user-1')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw BadRequestError if not pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-1', status: 'accepted' }],
      });

      await expect(
        shiftSwapService.cancel('test-tenant', 'swap-1', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ============================================
  // ACCEPT
  // ============================================
  describe('accept', () => {
    it('should accept swap request', async () => {
      // getSwapById
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          schedule_id: 'schedule-1',
          offered_to_user_id: null,
          original_start: new Date(),
          original_end: new Date(),
          swap_number: 'SWAP-001',
        }],
      });
      // Rotation check for accepter
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });
      // UPDATE swap
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Get requester for notification
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'john@example.com', name: 'John' }] });
      // getById return
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'swap-1', status: 'accepted' }] });

      const result = await shiftSwapService.accept('test-tenant', 'swap-1', 'user-2', 'Happy to help!');

      expect(result.status).toBe('accepted');
      expect(oncallScheduleService.createOverride).toHaveBeenCalled();
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'shiftswaps');
    });

    it('should throw BadRequestError if accepting own request', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-1', status: 'pending' }],
      });

      await expect(
        shiftSwapService.accept('test-tenant', 'swap-1', 'user-1')
      ).rejects.toThrow('You cannot accept your own swap request');
    });

    it('should throw BadRequestError if not pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', requester_id: 'user-1', status: 'accepted' }],
      });

      await expect(
        shiftSwapService.accept('test-tenant', 'swap-1', 'user-2')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if expired', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          expires_at: new Date(Date.now() - 1000), // Expired
        }],
      });
      // Auto-expire update
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(
        shiftSwapService.accept('test-tenant', 'swap-1', 'user-2')
      ).rejects.toThrow('This swap request has expired');
    });

    it('should throw ForbiddenError if offered to different user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          offered_to_user_id: 'user-3', // Offered to user-3, not user-2
          expires_at: null,
        }],
      });

      await expect(
        shiftSwapService.accept('test-tenant', 'swap-1', 'user-2')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError if not in rotation for open swaps', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          offered_to_user_id: null, // Open swap
          schedule_id: 'schedule-1',
          expires_at: null,
        }],
      });
      // Rotation check fails
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        shiftSwapService.accept('test-tenant', 'swap-1', 'user-2')
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // ============================================
  // REJECT
  // ============================================
  describe('reject', () => {
    it('should reject swap offered to user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          offered_to_user_id: 'user-2',
        }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'rejected' }],
      });
      // Get requester for notification
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'john@example.com' }] });
      // getById
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'rejected' }],
      });

      const result = await shiftSwapService.reject('test-tenant', 'swap-1', 'user-2', 'Not available');

      expect(result.status).toBe('rejected');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'shiftswaps');
    });

    it('should throw ForbiddenError if not offered to user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          offered_to_user_id: 'user-3', // Offered to user-3
        }],
      });

      await expect(
        shiftSwapService.reject('test-tenant', 'swap-1', 'user-2')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError for open swaps', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          offered_to_user_id: null, // Open swap
        }],
      });

      await expect(
        shiftSwapService.reject('test-tenant', 'swap-1', 'user-2')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw BadRequestError if not pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'accepted',
          offered_to_user_id: 'user-2',
        }],
      });

      await expect(
        shiftSwapService.reject('test-tenant', 'swap-1', 'user-2')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if swap not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        shiftSwapService.reject('test-tenant', 'nonexistent', 'user-2')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // ADMIN APPROVE
  // ============================================
  describe('adminApprove', () => {
    it('should admin approve with specified accepter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          schedule_id: 'schedule-1',
          original_start: new Date(),
          original_end: new Date(),
          swap_number: 'SWAP-001',
        }],
      });
      // Rotation check for accepter
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rot-1' }] });
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // getById
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'accepted', approved_by: 'admin-1' }],
      });

      const result = await shiftSwapService.adminApprove(
        'test-tenant',
        'swap-1',
        'admin-1',
        'user-2'
      );

      expect(result.approved_by).toBe('admin-1');
      expect(oncallScheduleService.createOverride).toHaveBeenCalled();
    });

    it('should use offered_to_user_id if no accepter specified', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          requester_id: 'user-1',
          status: 'pending',
          schedule_id: 'schedule-1',
          offered_to_user_id: 'user-2',
          original_start: new Date(),
          original_end: new Date(),
          swap_number: 'SWAP-001',
        }],
      });
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // getById
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', accepter_id: 'user-2' }],
      });

      const result = await shiftSwapService.adminApprove(
        'test-tenant',
        'swap-1',
        'admin-1'
      );

      expect(result.accepter_id).toBe('user-2');
    });

    it('should throw BadRequestError if not pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'accepted' }],
      });

      await expect(
        shiftSwapService.adminApprove('test-tenant', 'swap-1', 'admin-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError for open swap without accepter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'swap-1',
          status: 'pending',
          offered_to_user_id: null, // Open swap
        }],
      });

      await expect(
        shiftSwapService.adminApprove('test-tenant', 'swap-1', 'admin-1')
      ).rejects.toThrow('An accepter user ID must be provided');
    });

    it('should validate accepter is in rotation', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'pending', schedule_id: 'schedule-1' }],
      });
      // Rotation check fails
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        shiftSwapService.adminApprove('test-tenant', 'swap-1', 'admin-1', 'user-99')
      ).rejects.toThrow('Accepter must be in the schedule rotation');
    });

    it('should throw NotFoundError if swap not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        shiftSwapService.adminApprove('test-tenant', 'nonexistent', 'admin-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // COMPLETE
  // ============================================
  describe('complete', () => {
    it('should complete accepted swap after shift ends', async () => {
      const pastEnd = new Date(Date.now() - 1000);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'accepted', original_end: pastEnd }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'completed' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'completed' }],
      });

      const result = await shiftSwapService.complete('test-tenant', 'swap-1');

      expect(result.status).toBe('completed');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'shiftswaps');
    });

    it('should throw BadRequestError if not accepted', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'pending' }],
      });

      await expect(
        shiftSwapService.complete('test-tenant', 'swap-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if shift not ended', async () => {
      const futureEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1', status: 'accepted', original_end: futureEnd }],
      });

      await expect(
        shiftSwapService.complete('test-tenant', 'swap-1')
      ).rejects.toThrow('Cannot complete swap before the shift has ended');
    });

    it('should throw NotFoundError if swap not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        shiftSwapService.complete('test-tenant', 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // EXPIRATION
  // ============================================
  describe('expireOldRequests', () => {
    it('should expire requests past expiry date', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1' }, { id: 'swap-2' }],
        rowCount: 2,
      });

      const count = await shiftSwapService.expireOldRequests('test-tenant');

      expect(count).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at < NOW()')
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'shiftswaps');
    });

    it('should not invalidate cache if no expirations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const count = await shiftSwapService.expireOldRequests('test-tenant');

      expect(count).toBe(0);
      expect(cacheService.invalidateTenant).not.toHaveBeenCalled();
    });
  });

  describe('expirePassedShifts', () => {
    it('should expire requests for shifts that started', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'swap-1' }],
        rowCount: 1,
      });

      const count = await shiftSwapService.expirePassedShifts('test-tenant');

      expect(count).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('original_start < NOW()')
      );
    });
  });

  // ============================================
  // STATISTICS
  // ============================================
  describe('getScheduleStats', () => {
    it('should get stats for schedule', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total: '50',
          pending: '10',
          accepted: '20',
          rejected: '5',
          cancelled: '5',
          expired: '5',
          completed: '5',
        }],
      });

      const result = await shiftSwapService.getScheduleStats('test-tenant', 'schedule-1');

      expect(result.total).toBe(50);
      expect(result.pending).toBe(10);
      expect(result.accepted).toBe(20);
      expect(result.rejected).toBe(5);
    });

    it('should filter by date range', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '10', pending: '5', accepted: '5', rejected: '0', cancelled: '0', expired: '0', completed: '0' }],
      });

      await shiftSwapService.getScheduleStats(
        'test-tenant',
        'schedule-1',
        '2025-01-01',
        '2025-01-31'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('original_start >= $2'),
        expect.arrayContaining(['schedule-1', '2025-01-01', '2025-01-31'])
      );
    });
  });
});
