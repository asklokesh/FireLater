import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies before importing the service under test
// ---------------------------------------------------------------------------

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

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { pool } from '../config/database.js';
import { SodService } from './sod.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

function mockPolicies(
  rows: Array<{
    id: string;
    name: string;
    conflicting_role_a: string;
    conflicting_role_b: string;
  }>
) {
  // First call returns policies; subsequent calls (recordEvaluation INSERT) succeed silently
  mockQuery
    .mockResolvedValueOnce({ rows })
    .mockResolvedValue({ rows: [] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SodService', () => {
  let service: SodService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SodService();
  });

  // -------------------------------------------------------------------------
  describe('evaluate()', () => {
    it('returns allowed=true when there are no active policies', async () => {
      mockPolicies([]);

      const result = await service.evaluate('acme', {
        actorId: 'user-1',
        actorRoles: ['requester'],
        attemptedRole: 'approver',
        entityType: 'change',
        entityId: 'change-42',
        action: 'approve',
      });

      expect(result.allowed).toBe(true);
      expect(result.deniedByPolicy).toBeUndefined();
    });

    it('returns allowed=true when actor roles do not conflict with any policy', async () => {
      mockPolicies([
        {
          id: 'policy-1',
          name: 'Requester Cannot Approve',
          conflicting_role_a: 'requester',
          conflicting_role_b: 'approver',
        },
      ]);

      const result = await service.evaluate('acme', {
        actorId: 'user-2',
        actorRoles: ['viewer'],           // actor only has 'viewer' — no conflict
        attemptedRole: 'approver',
        entityType: 'change',
        entityId: 'change-99',
        action: 'approve',
      });

      expect(result.allowed).toBe(true);
    });

    it('returns allowed=false when actor already holds conflicting_role_a and attempts conflicting_role_b', async () => {
      mockPolicies([
        {
          id: 'policy-1',
          name: 'Requester Cannot Approve',
          conflicting_role_a: 'requester',
          conflicting_role_b: 'approver',
        },
      ]);

      const result = await service.evaluate('acme', {
        actorId: 'user-1',
        actorRoles: ['requester'],        // actor is the requester…
        attemptedRole: 'approver',        // …and tries to approve
        entityType: 'change',
        entityId: 'change-42',
        action: 'approve',
      });

      expect(result.allowed).toBe(false);
      expect(result.deniedByPolicy).toBe('Requester Cannot Approve');
      expect(result.policyId).toBe('policy-1');
    });

    it('returns allowed=false when actor already holds conflicting_role_b and attempts conflicting_role_a (reverse)', async () => {
      mockPolicies([
        {
          id: 'policy-1',
          name: 'Requester Cannot Approve',
          conflicting_role_a: 'requester',
          conflicting_role_b: 'approver',
        },
      ]);

      const result = await service.evaluate('acme', {
        actorId: 'user-1',
        actorRoles: ['approver'],         // actor already approved…
        attemptedRole: 'requester',       // …and tries to raise the request
        entityType: 'change',
        entityId: 'change-42',
        action: 'request',
      });

      expect(result.allowed).toBe(false);
      expect(result.deniedByPolicy).toBe('Requester Cannot Approve');
    });

    // -----------------------------------------------------------------------
    // Default banking policies

    describe('default banking policies', () => {
      it('blocks self-approval: requester cannot approve their own change', async () => {
        mockPolicies([
          {
            id: 'policy-default-1',
            name: 'Requester Cannot Approve',
            conflicting_role_a: 'requester',
            conflicting_role_b: 'approver',
          },
          {
            id: 'policy-default-2',
            name: 'Approver Cannot Implement',
            conflicting_role_a: 'approver',
            conflicting_role_b: 'implementer',
          },
        ]);

        const result = await service.evaluate('bank', {
          actorId: 'banker-1',
          actorRoles: ['requester'],
          attemptedRole: 'approver',
          entityType: 'change',
          entityId: 'chg-001',
          action: 'approve',
        });

        expect(result.allowed).toBe(false);
        expect(result.policyId).toBe('policy-default-1');
      });

      it('blocks approver from implementing the same change', async () => {
        mockPolicies([
          {
            id: 'policy-default-1',
            name: 'Requester Cannot Approve',
            conflicting_role_a: 'requester',
            conflicting_role_b: 'approver',
          },
          {
            id: 'policy-default-2',
            name: 'Approver Cannot Implement',
            conflicting_role_a: 'approver',
            conflicting_role_b: 'implementer',
          },
        ]);

        const result = await service.evaluate('bank', {
          actorId: 'banker-2',
          actorRoles: ['approver'],
          attemptedRole: 'implementer',
          entityType: 'change',
          entityId: 'chg-001',
          action: 'implement',
        });

        expect(result.allowed).toBe(false);
        expect(result.policyId).toBe('policy-default-2');
      });

      it('allows a distinct implementer who has not approved the change', async () => {
        mockPolicies([
          {
            id: 'policy-default-1',
            name: 'Requester Cannot Approve',
            conflicting_role_a: 'requester',
            conflicting_role_b: 'approver',
          },
          {
            id: 'policy-default-2',
            name: 'Approver Cannot Implement',
            conflicting_role_a: 'approver',
            conflicting_role_b: 'implementer',
          },
        ]);

        const result = await service.evaluate('bank', {
          actorId: 'banker-3',
          actorRoles: [],                 // fresh actor — no existing roles
          attemptedRole: 'implementer',
          entityType: 'change',
          entityId: 'chg-001',
          action: 'implement',
        });

        expect(result.allowed).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('recordEvaluation()', () => {
    it('inserts a row and does not throw', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.recordEvaluation('acme', {
          policyId: 'policy-1',
          actorId: 'user-1',
          entityType: 'change',
          entityId: 'change-42',
          action: 'approve',
          decision: 'deny',
          matchedRule: 'requester≠approver',
        })
      ).resolves.toBeUndefined();

      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('swallows DB errors so primary flow is not blocked', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(
        service.recordEvaluation('acme', {
          policyId: null,
          actorId: 'user-1',
          entityType: 'change',
          entityId: 'change-42',
          action: 'approve',
          decision: 'allow',
        })
      ).resolves.toBeUndefined();
    });
  });
});
