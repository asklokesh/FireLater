import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recertificationService } from '../../src/services/recertification.js';

// Mock database pool
vi.mock('../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock cache service
vi.mock('../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn((_key: string, fn: () => unknown) => fn()),
    invalidateTenant: vi.fn(),
  },
}));

// Mock tenant service
vi.mock('../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug}`),
  },
}));

describe('RecertificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCampaign()', () => {
    it('creates a campaign in draft status', async () => {
      const { pool } = await import('../../src/config/database.js');

      const fakeCampaign = {
        id: 'campaign-uuid-1',
        name: 'Q1 2026 Access Review',
        description: 'Quarterly recertification',
        scope_type: 'all_users',
        scope_value: null,
        owner_id: 'owner-1',
        owner_email: 'owner@example.com',
        due_date: new Date('2026-03-31'),
        status: 'draft',
        total_items: 0,
        reviewed_items: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [fakeCampaign],
        rowCount: 1,
      });

      const result = await recertificationService.createCampaign('acme', {
        name: 'Q1 2026 Access Review',
        description: 'Quarterly recertification',
        scopeType: 'all_users',
        ownerId: 'owner-1',
        ownerEmail: 'owner@example.com',
        dueDate: new Date('2026-03-31'),
      });

      expect(result.status).toBe('draft');
      expect(result.name).toBe('Q1 2026 Access Review');
      expect(result.id).toBe('campaign-uuid-1');

      // Verify INSERT was called
      const callArgs = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toContain('INSERT INTO tenant_acme.recertification_campaigns');
    });
  });

  describe('launchCampaign()', () => {
    it('sets campaign status to active', async () => {
      const { pool } = await import('../../src/config/database.js');

      const draftCampaign = {
        id: 'campaign-uuid-1',
        name: 'Q1 2026 Access Review',
        scope_type: 'role',
        scope_value: 'analyst',
        owner_id: 'owner-1',
        owner_email: 'owner@example.com',
        due_date: new Date('2026-03-31'),
        status: 'draft',
        total_items: 0,
        reviewed_items: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // getCampaign (first call — cache returns null, fetch from DB)
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [draftCampaign],
        rowCount: 1,
      });

      // _buildCampaignItems: users with role='analyst'
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'alice@example.com',
            name: 'Alice',
            role: 'analyst',
            manager_id: 'manager-1',
          },
        ],
        rowCount: 1,
      });

      // INSERT items
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      // UPDATE campaign to active
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      await recertificationService.launchCampaign('acme', 'campaign-uuid-1');

      // Verify the UPDATE to active was called
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const updateCall = calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          c[0].includes('UPDATE') &&
          c[0].includes("status = 'active'")
      );
      expect(updateCall).toBeDefined();
    });

    it('throws BadRequestError if campaign is not in draft status', async () => {
      const { pool } = await import('../../src/config/database.js');

      const activeCampaign = {
        id: 'campaign-uuid-2',
        name: 'Already Active',
        scope_type: 'all_users',
        scope_value: null,
        owner_id: 'owner-1',
        owner_email: null,
        due_date: new Date('2026-03-31'),
        status: 'active',
        total_items: 10,
        reviewed_items: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [activeCampaign],
        rowCount: 1,
      });

      await expect(
        recertificationService.launchCampaign('acme', 'campaign-uuid-2')
      ).rejects.toThrow("Campaign cannot be launched from status 'active'");
    });
  });

  describe('decideItem()', () => {
    it('updates item status to decided and records decision', async () => {
      const { pool } = await import('../../src/config/database.js');

      const pendingItem = {
        id: 'item-uuid-1',
        campaign_id: 'campaign-uuid-1',
        user_id: 'user-1',
        user_email: 'alice@example.com',
        user_name: 'Alice',
        resource_type: 'role',
        resource_id: 'analyst',
        resource_name: 'Analyst',
        reviewer_id: 'manager-1',
        reviewer_email: null,
        decision: null,
        decision_comment: null,
        decided_at: null,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // SELECT item
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [pendingItem],
        rowCount: 1,
      });

      // UPDATE item
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      // UPDATE campaign reviewed_items count
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      await recertificationService.decideItem(
        'acme',
        'item-uuid-1',
        'manager-1',
        'manager@example.com',
        'approved',
        'Looks good'
      );

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;

      // Verify UPDATE item was called with 'decided' status
      const updateItemCall = calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          c[0].includes('UPDATE') &&
          c[0].includes("status = 'decided'")
      );
      expect(updateItemCall).toBeDefined();
    });

    it('creates audit log entry when decision is revoked', async () => {
      const { pool } = await import('../../src/config/database.js');

      const pendingItem = {
        id: 'item-uuid-2',
        campaign_id: 'campaign-uuid-1',
        user_id: 'user-2',
        user_email: 'bob@example.com',
        user_name: 'Bob',
        resource_type: 'role',
        resource_id: 'admin',
        resource_name: 'Admin',
        reviewer_id: null,
        reviewer_email: null,
        decision: null,
        decision_comment: null,
        decided_at: null,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // SELECT item
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [pendingItem],
        rowCount: 1,
      });

      // UPDATE item
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      // UPDATE campaign reviewed_items
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      // INSERT audit log
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ id: 'audit-log-1' }],
        rowCount: 1,
      });

      await recertificationService.decideItem(
        'acme',
        'item-uuid-2',
        'security-officer-1',
        'security@example.com',
        'revoked',
        'Access no longer required'
      );

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;

      // Verify audit log INSERT with permission_revoked action (hardcoded in SQL)
      const auditLogCall = calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          c[0].includes('INSERT INTO') &&
          c[0].includes('audit_logs') &&
          c[0].includes('permission_revoked')
      );
      expect(auditLogCall).toBeDefined();
    });

    it('throws BadRequestError when item is already decided', async () => {
      const { pool } = await import('../../src/config/database.js');

      const decidedItem = {
        id: 'item-uuid-3',
        campaign_id: 'campaign-uuid-1',
        user_id: 'user-3',
        status: 'decided',
        decision: 'approved',
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [decidedItem],
        rowCount: 1,
      });

      await expect(
        recertificationService.decideItem(
          'acme',
          'item-uuid-3',
          'reviewer-1',
          'reviewer@example.com',
          'revoked'
        )
      ).rejects.toThrow('Item has already been decided.');
    });
  });
});
