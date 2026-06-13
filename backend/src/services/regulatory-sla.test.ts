import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegulatorySlaService } from './regulatory-sla.js';

// Mock the database pool
vi.mock('../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock tenant service
vi.mock('./tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
  },
}));

describe('RegulatorySlaService', () => {
  let service: RegulatorySlaService;
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new RegulatorySlaService();
    const dbModule = await import('../config/database.js');
    mockPool = dbModule.pool as unknown as { query: ReturnType<typeof vi.fn> };
  });

  // ============================================
  // startClocks
  // ============================================

  describe('startClocks()', () => {
    it('creates one clock per matching deadline', async () => {
      const tenantSlug = 'acme';
      const incidentId = 'inc-001';
      const classification = 'major';
      const detectedAt = new Date('2026-06-13T10:00:00Z');

      const matchingDeadlines = [
        { deadline_id: 'dl-1', framework_id: 'fw-dora', hours_from_detection: 4 },
        { deadline_id: 'dl-2', framework_id: 'fw-dora', hours_from_detection: 72 },
        { deadline_id: 'dl-3', framework_id: 'fw-dora', hours_from_detection: 720 },
      ];

      // First query: find matching deadlines
      mockPool.query.mockResolvedValueOnce({ rows: matchingDeadlines });

      // Subsequent queries: insert clock records (one per deadline)
      const clockRows = matchingDeadlines.map((dl, idx) => ({
        id: `clock-${idx + 1}`,
        incident_id: incidentId,
        framework_id: dl.framework_id,
        deadline_id: dl.deadline_id,
        detected_at: detectedAt,
        deadline_at: new Date(detectedAt.getTime() + dl.hours_from_detection * 3600 * 1000),
        status: 'running',
        notification_sent_at: null,
        notification_actor_id: null,
        notification_recipient: null,
        notification_evidence: null,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      for (const clockRow of clockRows) {
        mockPool.query.mockResolvedValueOnce({ rows: [clockRow] });
      }

      const clocks = await service.startClocks(tenantSlug, incidentId, classification, detectedAt);

      // Should have created exactly 3 clocks (one per deadline)
      expect(clocks).toHaveLength(3);

      // INSERT should have been called once per deadline
      const insertCalls = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO')
      );
      expect(insertCalls).toHaveLength(3);
    });

    it('returns empty array when no deadlines match classification', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const clocks = await service.startClocks(
        'acme',
        'inc-002',
        'minor',
        new Date()
      );

      expect(clocks).toHaveLength(0);
    });

    it('computes deadline_at as detectedAt + hours correctly', async () => {
      const detectedAt = new Date('2026-06-13T00:00:00Z');
      const hoursFromDetection = 4;
      const expectedDeadlineAt = new Date('2026-06-13T04:00:00Z');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ deadline_id: 'dl-1', framework_id: 'fw-dora', hours_from_detection: hoursFromDetection }],
      });

      const clockRow = {
        id: 'clock-1',
        incident_id: 'inc-003',
        framework_id: 'fw-dora',
        deadline_id: 'dl-1',
        detected_at: detectedAt,
        deadline_at: expectedDeadlineAt,
        status: 'running',
        notification_sent_at: null,
        notification_actor_id: null,
        notification_recipient: null,
        notification_evidence: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValueOnce({ rows: [clockRow] });

      await service.startClocks('acme', 'inc-003', 'major', detectedAt);

      // Verify the INSERT was called with correct deadline_at
      const insertCall = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO')
      );
      expect(insertCall).toBeDefined();
      // The 5th parameter (index 4) to the INSERT is deadline_at
      const insertParams = insertCall![1] as unknown[];
      const passedDeadlineAt = insertParams[4] as Date;
      expect(passedDeadlineAt.getTime()).toBe(expectedDeadlineAt.getTime());
    });
  });

  // ============================================
  // getAdherenceSummary
  // ============================================

  describe('getAdherenceSummary()', () => {
    it('counts met, breached, and running clocks correctly', async () => {
      const from = new Date('2026-06-01T00:00:00Z');
      const to = new Date('2026-06-30T23:59:59Z');

      // Mock aggregate query result
      mockPool.query.mockResolvedValueOnce({
        rows: [{ total: '10', met: '6', breached: '2', running: '2' }],
      });

      const summary = await service.getAdherenceSummary('acme', from, to);

      expect(summary.total).toBe(10);
      expect(summary.met).toBe(6);
      expect(summary.breached).toBe(2);
      expect(summary.running).toBe(2);
    });

    it('returns zeros when no clocks exist in the range', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ total: '0', met: '0', breached: '0', running: '0' }],
      });

      const summary = await service.getAdherenceSummary(
        'acme',
        new Date('2026-01-01'),
        new Date('2026-01-31')
      );

      expect(summary.total).toBe(0);
      expect(summary.met).toBe(0);
      expect(summary.breached).toBe(0);
      expect(summary.running).toBe(0);
    });

    it('passes correct date range to query', async () => {
      const from = new Date('2026-06-01T00:00:00Z');
      const to = new Date('2026-06-30T23:59:59Z');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ total: '0', met: '0', breached: '0', running: '0' }],
      });

      await service.getAdherenceSummary('acme', from, to);

      const queryCall = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0];
      const params = queryCall[1] as Date[];
      expect(params[0]).toEqual(from);
      expect(params[1]).toEqual(to);
    });
  });

  // ============================================
  // recordNotification
  // ============================================

  describe('recordNotification()', () => {
    it('marks a running clock as met', async () => {
      // UPDATE returns the updated row
      mockPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'clock-1' }] });

      await expect(
        service.recordNotification('acme', 'clock-1', 'user-1', 'DORA regulator', 'email confirmation')
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundError when clock does not exist', async () => {
      // UPDATE affects 0 rows
      mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      // Follow-up SELECT returns empty
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.recordNotification('acme', 'nonexistent-clock', 'user-1', 'DORA', 'evidence')
      ).rejects.toThrow('not found');
    });

    it('throws BadRequestError when clock is already met', async () => {
      // UPDATE affects 0 rows (already met)
      mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      // Follow-up SELECT returns clock with status 'met'
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'clock-1', status: 'met' }] });

      await expect(
        service.recordNotification('acme', 'clock-1', 'user-1', 'DORA', 'evidence')
      ).rejects.toThrow("status 'met'");
    });
  });
});
