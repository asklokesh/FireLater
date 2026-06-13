import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makerCheckerService } from './maker-checker.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

// Mock database pool
vi.mock('../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock tenant service
vi.mock('./tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug}`),
  },
}));

const TENANT = 'acme';
const SCHEMA = 'tenant_acme';

// Helper to build a fake PendingOperation row
function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: 'op-uuid-1',
    operation_type: 'privileged_access_grant',
    entity_type: null,
    entity_id: null,
    maker_id: 'user-maker',
    maker_email: 'maker@example.com',
    checker_id: null,
    checker_email: null,
    payload: { role: 'admin' },
    status: 'pending',
    justification: null,
    checker_comment: null,
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    decided_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('MakerCheckerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // createPendingOperation
  // ============================================================
  describe('createPendingOperation', () => {
    it('should create an operation with pending status', async () => {
      const { pool } = await import('../config/database.js');

      // First query: fetch config (expiry_hours)
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ expiry_hours: 24 }],
      });

      // Second query: INSERT returning the new row
      const row = makeRow();
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [row],
      });

      const result = await makerCheckerService.createPendingOperation(TENANT, {
        operationType: 'privileged_access_grant',
        makerId: 'user-maker',
        makerEmail: 'maker@example.com',
        payload: { role: 'admin' },
      });

      expect(result.status).toBe('pending');
      expect(result.maker_id).toBe('user-maker');
      expect(result.operation_type).toBe('privileged_access_grant');
    });

    it('should default to 24h expiry when operation type has no config', async () => {
      const { pool } = await import('../config/database.js');

      // Config query returns nothing → defaults to 24
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const row = makeRow();
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await makerCheckerService.createPendingOperation(TENANT, {
        operationType: 'unknown_type',
        makerId: 'user-maker',
        payload: {},
      });

      expect(result).toBeDefined();

      // Verify INSERT query used $8 = 24 (the default)
      const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(insertCall[1][7]).toBe(24); // 8th parameter (index 7) = expiryHours
    });
  });

  // ============================================================
  // approve
  // ============================================================
  describe('approve', () => {
    it('should throw BadRequestError when checker === maker', async () => {
      const { pool } = await import('../config/database.js');

      // getById query
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [makeRow({ maker_id: 'user-maker' })],
      });

      await expect(
        makerCheckerService.approve(TENANT, 'op-uuid-1', 'user-maker', 'maker@example.com')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError when operation is not pending', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [makeRow({ status: 'approved' })],
      });

      await expect(
        makerCheckerService.approve(TENANT, 'op-uuid-1', 'user-checker')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError when operation has expired', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [makeRow({ expires_at: new Date(Date.now() - 1000).toISOString() })],
      });

      await expect(
        makerCheckerService.approve(TENANT, 'op-uuid-1', 'user-checker')
      ).rejects.toThrow(BadRequestError);
    });

    it('should return approved operation when checker differs from maker', async () => {
      const { pool } = await import('../config/database.js');

      // getById
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [makeRow()],
      });

      const approvedRow = makeRow({
        status: 'approved',
        checker_id: 'user-checker',
        checker_email: 'checker@example.com',
        decided_at: new Date().toISOString(),
      });
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [approvedRow],
      });

      const result = await makerCheckerService.approve(
        TENANT,
        'op-uuid-1',
        'user-checker',
        'checker@example.com',
        'LGTM'
      );

      expect(result.status).toBe('approved');
      expect(result.checker_id).toBe('user-checker');
    });
  });

  // ============================================================
  // reject
  // ============================================================
  describe('reject', () => {
    it('should set status to rejected', async () => {
      const { pool } = await import('../config/database.js');

      // getById
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [makeRow()],
      });

      const rejectedRow = makeRow({
        status: 'rejected',
        checker_id: 'user-checker',
        checker_email: 'checker@example.com',
        checker_comment: 'Not justified',
        decided_at: new Date().toISOString(),
      });
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [rejectedRow],
      });

      const result = await makerCheckerService.reject(
        TENANT,
        'op-uuid-1',
        'user-checker',
        'checker@example.com',
        'Not justified'
      );

      expect(result.status).toBe('rejected');
      expect(result.checker_comment).toBe('Not justified');
    });

    it('should throw BadRequestError when checker === maker', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [makeRow({ maker_id: 'same-user' })],
      });

      await expect(
        makerCheckerService.reject(TENANT, 'op-uuid-1', 'same-user')
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ============================================================
  // getById
  // ============================================================
  describe('getById', () => {
    it('should throw NotFoundError when operation does not exist', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await expect(
        makerCheckerService.getById(TENANT, 'nonexistent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should return the operation when found', async () => {
      const { pool } = await import('../config/database.js');

      const row = makeRow();
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await makerCheckerService.getById(TENANT, 'op-uuid-1');
      expect(result.id).toBe('op-uuid-1');
    });
  });

  // ============================================================
  // expireStale
  // ============================================================
  describe('expireStale', () => {
    it('should update expired records and return the count', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rowCount: 3 });

      const count = await makerCheckerService.expireStale(TENANT);

      expect(count).toBe(3);

      const [sql] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("status = 'expired'");
      expect(sql).toContain(`${SCHEMA}.pending_operations`);
    });

    it('should return 0 when no records to expire', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rowCount: 0 });

      const count = await makerCheckerService.expireStale(TENANT);

      expect(count).toBe(0);
    });
  });

  // ============================================================
  // list
  // ============================================================
  describe('list', () => {
    it('should return all operations when no filters provided', async () => {
      const { pool } = await import('../config/database.js');

      const rows = [makeRow(), makeRow({ id: 'op-uuid-2' })];
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows });

      const result = await makerCheckerService.list(TENANT);
      expect(result).toHaveLength(2);
    });

    it('should apply status filter', async () => {
      const { pool } = await import('../config/database.js');

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await makerCheckerService.list(TENANT, { status: 'approved' });

      const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('status = $1');
      expect(params).toContain('approved');
    });
  });
});
