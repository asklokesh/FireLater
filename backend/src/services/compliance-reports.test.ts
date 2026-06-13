import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for ComplianceReportsService
 *
 * Coverage:
 * - exportToCsv() produces valid CSV with headers
 * - generateReport('change_success_rate') returns summary with percentage
 * - generateReport() handles missing tables gracefully (returns empty data, no throw)
 */

// ============================================
// MOCKS
// ============================================

const mockQuery = vi.fn();

vi.mock('../config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
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

// ============================================
// IMPORT UNDER TEST (after mocks)
// ============================================

import { ComplianceReportsService } from './compliance-reports.js';

// ============================================
// HELPERS
// ============================================

function makeService() {
  return new ComplianceReportsService();
}

// ============================================
// TESTS
// ============================================

describe('ComplianceReportsService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // -----------------------------------------------
  // exportToCsv
  // -----------------------------------------------
  describe('exportToCsv', () => {
    it('produces CSV with correct headers matching data keys', () => {
      const service = makeService();

      const result = {
        reportType: 'change_success_rate' as const,
        generatedAt: new Date('2024-01-01T00:00:00Z'),
        params: { from: new Date('2024-01-01'), to: new Date('2024-01-31') },
        summary: { total: 10, successRate: 80 },
        data: [
          { status: 'completed', count: 8 },
          { status: 'failed', count: 2 },
        ],
      };

      const csv = service.exportToCsv(result);
      const lines = csv.split('\n');

      // First line must be the header
      expect(lines[0]).toBe('status,count');
      // Subsequent lines must be data rows
      expect(lines[1]).toBe('completed,8');
      expect(lines[2]).toBe('failed,2');
    });

    it('escapes values that contain commas', () => {
      const service = makeService();

      const result = {
        reportType: 'unauthorized_changes' as const,
        generatedAt: new Date(),
        params: { from: new Date(), to: new Date() },
        summary: {},
        data: [{ title: 'Change, with comma', status: 'completed' }],
      };

      const csv = service.exportToCsv(result);
      expect(csv).toContain('"Change, with comma"');
    });

    it('escapes values that contain double-quotes', () => {
      const service = makeService();

      const result = {
        reportType: 'unauthorized_changes' as const,
        generatedAt: new Date(),
        params: { from: new Date(), to: new Date() },
        summary: {},
        data: [{ title: 'Change "alpha"', status: 'completed' }],
      };

      const csv = service.exportToCsv(result);
      expect(csv).toContain('"Change ""alpha"""');
    });

    it('returns minimal meta CSV when data array is empty', () => {
      const service = makeService();

      const result = {
        reportType: 'sod_violation_attempts' as const,
        generatedAt: new Date('2024-06-01T00:00:00Z'),
        params: { from: new Date('2024-01-01'), to: new Date('2024-06-01') },
        summary: { total: 0 },
        data: [],
      };

      const csv = service.exportToCsv(result);
      const lines = csv.split('\n');
      // Should still have at least 2 lines (header + 1 data row)
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[0]).toContain('reportType');
    });
  });

  // -----------------------------------------------
  // generateReport – change_success_rate
  // -----------------------------------------------
  describe('generateReport (change_success_rate)', () => {
    it('returns summary with successRate percentage when changes exist', async () => {
      const service = makeService();

      // Mock the pool.query for change_requests GROUP BY status
      mockQuery.mockResolvedValueOnce({
        rows: [
          { status: 'completed', count: '8' },
          { status: 'failed', count: '2' },
        ],
      });

      const result = await service.generateReport('test-tenant', 'change_success_rate', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.reportType).toBe('change_success_rate');
      expect(result.summary).toHaveProperty('successRate');
      expect(result.summary.successRate).toBe(80); // 8 / 10 = 80%
      expect(result.summary.total).toBe(10);
      expect(result.summary.successful).toBe(8);
      expect(result.summary.failed).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('returns 0% successRate when there are no changes', async () => {
      const service = makeService();

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.generateReport('test-tenant', 'change_success_rate', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.summary.successRate).toBe(0);
      expect(result.summary.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });

  // -----------------------------------------------
  // generateReport – graceful handling of missing tables
  // -----------------------------------------------
  describe('generateReport – missing table graceful handling', () => {
    it('returns empty data for sod_violation_attempts when table does not exist', async () => {
      const service = makeService();

      // First call: information_schema check → table does NOT exist
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

      const result = await service.generateReport('test-tenant', 'sod_violation_attempts', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.reportType).toBe('sod_violation_attempts');
      expect(result.data).toHaveLength(0);
      expect(result.summary.total).toBe(0);
      // Must not throw
    });

    it('returns empty data for access_recertification_status when table does not exist', async () => {
      const service = makeService();

      // information_schema check → table does NOT exist
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

      const result = await service.generateReport('test-tenant', 'access_recertification_status', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.reportType).toBe('access_recertification_status');
      expect(result.data).toHaveLength(0);
    });

    it('returns empty data when the change_requests table query fails', async () => {
      const service = makeService();

      // Simulate DB error (e.g., table missing entirely)
      mockQuery.mockRejectedValueOnce(new Error('relation "tenant_test.change_requests" does not exist'));

      const result = await service.generateReport('test-tenant', 'change_success_rate', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      // Must not throw, must return empty
      expect(result.reportType).toBe('change_success_rate');
      expect(result.data).toHaveLength(0);
    });

    it('returns empty data for emergency_change_usage when query errors', async () => {
      const service = makeService();

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.generateReport('test-tenant', 'emergency_change_usage', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.reportType).toBe('emergency_change_usage');
      expect(result.data).toHaveLength(0);
    });

    it('returns empty data for unauthorized_changes when query errors', async () => {
      const service = makeService();

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.generateReport('test-tenant', 'unauthorized_changes', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.reportType).toBe('unauthorized_changes');
      expect(result.data).toHaveLength(0);
    });
  });

  // -----------------------------------------------
  // generateReport – sla_breach_evidence fallback
  // -----------------------------------------------
  describe('generateReport (sla_breach_evidence)', () => {
    it('uses sla_breaches table when it exists', async () => {
      const service = makeService();

      // information_schema check → sla_breaches exists
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });
      // sla_breaches query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'abc', entity_type: 'issue', entity_id: 'xyz', breach_type: 'response', breached_at: new Date() },
        ],
      });

      const result = await service.generateReport('test-tenant', 'sla_breach_evidence', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.data).toHaveLength(1);
      expect(result.summary.totalBreaches).toBe(1);
    });

    it('falls back to issues table when sla_breaches does not exist', async () => {
      const service = makeService();

      // information_schema check → sla_breaches does NOT exist
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });
      // issues fallback query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'i1', title: 'Overdue P1', priority: 'P1', status: 'open', sla_breach_at: new Date() },
        ],
      });

      const result = await service.generateReport('test-tenant', 'sla_breach_evidence', {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      });

      expect(result.data).toHaveLength(1);
      expect(result.summary.source).toBe('issues');
    });
  });

  // -----------------------------------------------
  // Schedule management
  // -----------------------------------------------
  describe('listSchedules', () => {
    it('returns rows from the schedules table', async () => {
      const service = makeService();

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sched-1', report_type: 'change_success_rate', name: 'Monthly SOX Report' }],
      });

      const schedules = await service.listSchedules('test-tenant');
      expect(schedules).toHaveLength(1);
      expect((schedules[0] as Record<string, unknown>).id).toBe('sched-1');
    });
  });

  describe('createSchedule', () => {
    it('inserts and returns the new schedule', async () => {
      const service = makeService();

      const inserted = {
        id: 'new-id',
        report_type: 'change_success_rate',
        name: 'Monthly Report',
        cadence: 'monthly',
        recipients: ['admin@example.com'],
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [inserted] });

      const result = await service.createSchedule('test-tenant', {
        reportType: 'change_success_rate',
        name: 'Monthly Report',
        cadence: 'monthly',
        recipients: ['admin@example.com'],
      });

      expect((result as typeof inserted).id).toBe('new-id');
      expect((result as typeof inserted).cadence).toBe('monthly');
    });
  });

  describe('recordRun', () => {
    it('inserts a completed run and updates last_run_at on schedule', async () => {
      const service = makeService();

      // INSERT run
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'run-id-1' }] });
      // UPDATE schedule last_run_at
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const reportResult = {
        reportType: 'change_success_rate' as const,
        generatedAt: new Date(),
        params: { from: new Date(), to: new Date() },
        summary: { total: 5, successRate: 80 },
        data: [],
      };

      const runId = await service.recordRun(
        'test-tenant',
        'sched-123',
        'change_success_rate',
        reportResult
      );

      expect(runId).toBe('run-id-1');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('inserts a failed run record when error is provided', async () => {
      const service = makeService();

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'run-id-2' }] });
      // No schedule update when scheduleId is null
      const runId = await service.recordRun(
        'test-tenant',
        null,
        'change_success_rate',
        null,
        'Something went wrong'
      );

      expect(runId).toBe('run-id-2');
      // No second call since scheduleId is null
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});
