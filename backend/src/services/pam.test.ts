import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pamService } from './pam.js';
import { BadRequestError } from '../utils/errors.js';

// ============================================
// MOCKS
// ============================================

vi.mock('../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('./tenant.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `tenant_${slug}`,
  },
}));

const TENANT_SLUG = 'acme';

// ============================================
// TESTS
// ============================================

describe('PamService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------
  describe('requestGrant()', () => {
    it('throws BadRequestError when durationHours exceeds max_duration_hours', async () => {
      const { pool } = await import('../config/database.js');

      // Return a config with max_duration_hours = 4
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'cfg-1',
            privilege_type: 'db_read',
            max_duration_hours: 4,
            requires_approver: true,
            auto_approve: false,
          },
        ],
        rowCount: 1,
      });

      await expect(
        pamService.requestGrant(TENANT_SLUG, {
          requesterId: 'user-1',
          privilegeType: 'db_read',
          reason: 'Need read access for incident investigation',
          durationHours: 8, // > max 4
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('immediately sets status to active when auto_approve=true', async () => {
      const { pool } = await import('../config/database.js');

      // Config says auto_approve=true
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'cfg-2',
            privilege_type: 'low_risk_tool',
            max_duration_hours: 8,
            requires_approver: false,
            auto_approve: true,
          },
        ],
        rowCount: 1,
      });

      const fakeGrant = {
        id: 'grant-auto-1',
        status: 'active',
        requester_id: 'user-1',
        privilege_type: 'low_risk_tool',
        requested_duration_hours: 2,
        granted_at: new Date(),
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [fakeGrant],
        rowCount: 1,
      });

      const result = await pamService.requestGrant(TENANT_SLUG, {
        requesterId: 'user-1',
        privilegeType: 'low_risk_tool',
        reason: 'Routine check',
        durationHours: 2,
      });

      expect(result.status).toBe('active');
    });

    it('creates a pending grant when no auto_approve', async () => {
      const { pool } = await import('../config/database.js');

      // Config with auto_approve=false
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'cfg-3',
            privilege_type: 'admin',
            max_duration_hours: 8,
            requires_approver: true,
            auto_approve: false,
          },
        ],
        rowCount: 1,
      });

      const fakeGrant = {
        id: 'grant-1',
        status: 'pending',
        requester_id: 'user-1',
        privilege_type: 'admin',
        requested_duration_hours: 4,
        granted_at: null,
        expires_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [fakeGrant],
        rowCount: 1,
      });

      const result = await pamService.requestGrant(TENANT_SLUG, {
        requesterId: 'user-1',
        privilegeType: 'admin',
        reason: 'Emergency admin access needed for P1 outage',
        durationHours: 4,
      });

      expect(result.status).toBe('pending');
      expect(result.granted_at).toBeNull();
    });
  });

  // ------------------------------------------
  describe('approveGrant()', () => {
    it('throws BadRequestError when approver is the same as requester', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'grant-1',
            requester_id: 'user-1',
            status: 'pending',
            requested_duration_hours: 4,
          },
        ],
        rowCount: 1,
      });

      await expect(
        pamService.approveGrant(TENANT_SLUG, 'grant-1', 'user-1', 'user1@example.com')
      ).rejects.toThrow(BadRequestError);
    });

    it('activates the grant when approved by a different user', async () => {
      const { pool } = await import('../config/database.js');

      // Fetch grant
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'grant-2',
            requester_id: 'user-1',
            status: 'pending',
            requested_duration_hours: 2,
          },
        ],
        rowCount: 1,
      });

      const approvedGrant = {
        id: 'grant-2',
        requester_id: 'user-1',
        approver_id: 'user-2',
        status: 'active',
        requested_duration_hours: 2,
        granted_at: new Date(),
        expires_at: new Date(Date.now() + 2 * 3600 * 1000),
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Update grant
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [approvedGrant],
        rowCount: 1,
      });

      const result = await pamService.approveGrant(TENANT_SLUG, 'grant-2', 'user-2', 'approver@example.com');

      expect(result.status).toBe('active');
      expect(result.approver_id).toBe('user-2');
    });

    it('throws BadRequestError when grant is not in pending status', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'grant-3',
            requester_id: 'user-1',
            status: 'revoked',
            requested_duration_hours: 4,
          },
        ],
        rowCount: 1,
      });

      await expect(
        pamService.approveGrant(TENANT_SLUG, 'grant-3', 'user-2')
      ).rejects.toThrow(BadRequestError);
    });
  });
});
