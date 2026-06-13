import { describe, it, expect, vi, afterEach } from 'vitest';

// ============================================
// MOCKS
// ============================================

const mockQuery = vi.fn();

vi.mock('../config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { emergencyChangeService } from './emergency-change.js';
import { BadRequestError } from '../utils/errors.js';

// ============================================
// TESTS
// ============================================

describe('EmergencyChangeService', () => {
  const tenantSlug = 'test-tenant';
  const requesterId = 'user-requester-123';
  const reviewerId = 'user-reviewer-456';

  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ----------------------------------------
  // createEmergencyChange
  // ----------------------------------------
  describe('createEmergencyChange', () => {
    it('throws BadRequestError if emergencyJustification is missing', async () => {
      await expect(
        emergencyChangeService.createEmergencyChange(tenantSlug, requesterId, {
          title: 'Prod DB is down',
          description: 'Need to hotfix ASAP',
          emergencyJustification: '',          // Empty — should fail
          linkedIncidentId: 'INC-0042',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError if emergencyJustification is whitespace only', async () => {
      await expect(
        emergencyChangeService.createEmergencyChange(tenantSlug, requesterId, {
          title: 'Prod DB is down',
          description: 'Need to hotfix ASAP',
          emergencyJustification: '   ',       // Whitespace only — should fail
          linkedIncidentId: 'INC-0042',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError if linkedIncidentId is missing', async () => {
      await expect(
        emergencyChangeService.createEmergencyChange(tenantSlug, requesterId, {
          title: 'Prod DB is down',
          description: 'Need to hotfix ASAP',
          emergencyJustification: 'Production database experiencing data corruption under P1 incident',
          linkedIncidentId: '',                // Empty — should fail
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError if linkedIncidentId is whitespace only', async () => {
      await expect(
        emergencyChangeService.createEmergencyChange(tenantSlug, requesterId, {
          title: 'Prod DB is down',
          description: 'Need to hotfix ASAP',
          emergencyJustification: 'Production database experiencing data corruption under P1 incident',
          linkedIncidentId: '   ',             // Whitespace only — should fail
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('creates an emergency change and returns id + cabQueueId when valid', async () => {
      const fakeChangeId = 'change-uuid-999';
      const fakeCabQueueId = 'cab-queue-uuid-888';

      // next_id call
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'CHG-00099' }] });
      // INSERT change_requests
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: fakeChangeId,
          change_number: 'CHG-00099',
          is_emergency: true,
          post_review_status: 'pending',
          status: 'implementing',
        }],
      });
      // INSERT change_status_history
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT emergency_change_cab_queue
      mockQuery.mockResolvedValueOnce({ rows: [{ id: fakeCabQueueId, change_id: fakeChangeId }] });

      const result = await emergencyChangeService.createEmergencyChange(tenantSlug, requesterId, {
        title: 'Emergency patch for auth service',
        description: 'Auth service returning 500 for all logins',
        emergencyJustification: 'P1 outage — auth service completely down, all users locked out',
        linkedIncidentId: 'INC-1234',
      });

      expect(result.id).toBe(fakeChangeId);
      expect(result.cabQueueId).toBe(fakeCabQueueId);
      expect(result.change).toBeDefined();
    });
  });

  // ----------------------------------------
  // submitPostHocReview
  // ----------------------------------------
  describe('submitPostHocReview', () => {
    it('throws BadRequestError if reviewer === requester', async () => {
      const changeId = 'change-uuid-001';
      const sharedUserId = requesterId; // same user as reviewer

      // Fetch change — requester_id matches the reviewer ID
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: changeId,
          requester_id: sharedUserId,
          implementer_id: 'someone-else',
          post_review_status: 'pending',
        }],
      });

      await expect(
        emergencyChangeService.submitPostHocReview(
          tenantSlug,
          changeId,
          sharedUserId,         // reviewer === requester
          'reviewer@example.com',
          'approved',
          'Looks fine'
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError if reviewer === implementer', async () => {
      const changeId = 'change-uuid-002';
      const implementerId = 'implementer-user-789';

      // Fetch change — implementer_id matches the reviewer ID
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: changeId,
          requester_id: 'someone-else',
          implementer_id: implementerId,
          post_review_status: 'pending',
        }],
      });

      await expect(
        emergencyChangeService.submitPostHocReview(
          tenantSlug,
          changeId,
          implementerId,        // reviewer === implementer
          'implementer@example.com',
          'approved',
          'Looks fine'
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError if post_review_status is not pending', async () => {
      const changeId = 'change-uuid-003';

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: changeId,
          requester_id: 'another-requester',
          implementer_id: 'another-implementer',
          post_review_status: 'approved',     // Already reviewed
        }],
      });

      await expect(
        emergencyChangeService.submitPostHocReview(
          tenantSlug,
          changeId,
          reviewerId,
          'reviewer@example.com',
          'rejected'
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('successfully submits a review when reviewer is different from requester and implementer', async () => {
      const changeId = 'change-uuid-004';

      // Fetch change
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: changeId,
          requester_id: requesterId,
          implementer_id: 'some-implementer',
          post_review_status: 'pending',
        }],
      });
      // UPDATE change_requests
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE emergency_change_cab_queue
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Should not throw
      await expect(
        emergencyChangeService.submitPostHocReview(
          tenantSlug,
          changeId,
          reviewerId,                          // Different from requester and implementer
          'reviewer@example.com',
          'approved',
          'Change was necessary and well-executed'
        )
      ).resolves.toBeUndefined();

      // Verify the UPDATE was called with the right decision
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['approved', reviewerId, 'reviewer@example.com'])
      );
    });
  });

  // ----------------------------------------
  // listEmergencyChanges
  // ----------------------------------------
  describe('listEmergencyChanges', () => {
    it('returns emergency changes without filters', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'chg-1', is_emergency: true, post_review_status: 'pending' },
          { id: 'chg-2', is_emergency: true, post_review_status: 'approved' },
        ],
      });

      const result = await emergencyChangeService.listEmergencyChanges(tenantSlug);
      expect(result).toHaveLength(2);
    });

    it('filters by postReviewStatus when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'chg-1', is_emergency: true, post_review_status: 'pending' }],
      });

      await emergencyChangeService.listEmergencyChanges(tenantSlug, { postReviewStatus: 'pending' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('post_review_status = $1'),
        expect.arrayContaining(['pending'])
      );
    });
  });

  // ----------------------------------------
  // getPendingCabQueue
  // ----------------------------------------
  describe('getPendingCabQueue', () => {
    it('returns queued and assigned items', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'q-1', status: 'queued', change_id: 'chg-1' },
          { id: 'q-2', status: 'assigned', change_id: 'chg-2' },
        ],
      });

      const result = await emergencyChangeService.getPendingCabQueue(tenantSlug);
      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('queued', 'assigned')"),
        []
      );
    });
  });

  // ----------------------------------------
  // escalateOverdueReviews
  // ----------------------------------------
  describe('escalateOverdueReviews', () => {
    it('returns 0 when no overdue reviews exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const count = await emergencyChangeService.escalateOverdueReviews(tenantSlug);
      expect(count).toBe(0);
    });

    it('returns the count of overdue reviews', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'chg-1', change_number: 'CHG-00001' },
          { id: 'chg-2', change_number: 'CHG-00002' },
        ],
      });

      const count = await emergencyChangeService.escalateOverdueReviews(tenantSlug);
      expect(count).toBe(2);
    });
  });
});
