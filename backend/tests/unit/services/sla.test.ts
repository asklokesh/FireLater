import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for SLA Service
 * Testing SLA policy management, target configuration, and statistics
 *
 * Key coverage areas:
 * - SLA policy CRUD operations
 * - SLA target management
 * - SLA statistics calculations
 * - SLA configuration for breach detection
 */

// Mock dependencies
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
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

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import {
  slaService,
  listSlaPolicies,
  getSlaPolicy,
  createSlaPolicy,
  updateSlaPolicy,
  deleteSlaPolicy,
  updateSlaTarget,
  createSlaTarget,
  deleteSlaTarget,
  getSlaStats,
  getSlaConfigFromDb,
} from '../../../src/services/sla.js';
import { cacheService } from '../../../src/utils/cache.js';

describe('SLA Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  // ============================================
  // POLICY MANAGEMENT
  // ============================================
  describe('listSlaPolicies', () => {
    it('should list all SLA policies with targets', async () => {
      // First query: get policies
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'policy-1', name: 'Issue SLA', entity_type: 'issue', is_default: true },
          { id: 'policy-2', name: 'Problem SLA', entity_type: 'problem', is_default: false },
        ],
      });
      // Second query: get targets for policies
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'target-1', policy_id: 'policy-1', metric_type: 'response_time', priority: 'critical', target_minutes: 15 },
          { id: 'target-2', policy_id: 'policy-1', metric_type: 'resolution_time', priority: 'critical', target_minutes: 120 },
          { id: 'target-3', policy_id: 'policy-2', metric_type: 'response_time', priority: 'high', target_minutes: 30 },
        ],
      });

      const result = await listSlaPolicies('test-tenant');

      expect(result).toHaveLength(2);
      expect(result[0].targets).toHaveLength(2);
      expect(result[1].targets).toHaveLength(1);
      expect(cacheService.getOrSet).toHaveBeenCalled();
    });

    it('should filter policies by entityType', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'policy-1', name: 'Issue SLA', entity_type: 'issue' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listSlaPolicies('test-tenant', { entityType: 'issue' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('entity_type = $1'),
        ['issue']
      );
    });

    it('should return empty targets array when no policies exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await listSlaPolicies('test-tenant');

      expect(result).toHaveLength(0);
      // Should not call targets query when no policies
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSlaPolicy', () => {
    it('should get policy by ID with targets', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'policy-1', name: 'Issue SLA', entity_type: 'issue' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'target-1', policy_id: 'policy-1', metric_type: 'response_time', priority: 'critical' },
        ],
      });

      const result = await getSlaPolicy('test-tenant', 'policy-1');

      expect(result?.id).toBe('policy-1');
      expect(result?.targets).toHaveLength(1);
      expect(cacheService.getOrSet).toHaveBeenCalled();
    });

    it('should return null if policy not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getSlaPolicy('test-tenant', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createSlaPolicy', () => {
    it('should create policy with targets in transaction', async () => {
      // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT policy
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-policy', name: 'New SLA', entity_type: 'issue', is_default: false }],
      });
      // COMMIT
      mockClientQuery.mockResolvedValueOnce({ rows: [] });

      const result = await createSlaPolicy('test-tenant', {
        name: 'New SLA',
        entityType: 'issue',
      });

      expect(result.id).toBe('new-policy');
      expect(result.targets).toEqual([]);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'sla');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should create policy with targets', async () => {
      mockClientQuery
        // BEGIN
        .mockResolvedValueOnce({ rows: [] })
        // INSERT policy
        .mockResolvedValueOnce({
          rows: [{ id: 'new-policy', name: 'New SLA', entity_type: 'issue' }],
        })
        // Batch INSERT targets (using UNNEST - returns all targets in one query)
        .mockResolvedValueOnce({
          rows: [
            { id: 'target-1', policy_id: 'new-policy', metric_type: 'response_time', priority: 'critical', target_minutes: 15 },
            { id: 'target-2', policy_id: 'new-policy', metric_type: 'resolution_time', priority: 'critical', target_minutes: 120 },
          ],
        })
        // COMMIT
        .mockResolvedValueOnce({ rows: [] });

      const result = await createSlaPolicy('test-tenant', {
        name: 'New SLA',
        entityType: 'issue',
        targets: [
          { metricType: 'response_time', priority: 'critical', targetMinutes: 15 },
          { metricType: 'resolution_time', priority: 'critical', targetMinutes: 120 },
        ],
      });

      expect(result.targets).toHaveLength(2);
    });

    it('should unset other defaults when creating new default policy', async () => {
      mockClientQuery
        // BEGIN
        .mockResolvedValueOnce({ rows: [] })
        // UPDATE to unset existing defaults
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // INSERT policy
        .mockResolvedValueOnce({
          rows: [{ id: 'new-policy', name: 'Default SLA', is_default: true }],
        })
        // COMMIT
        .mockResolvedValueOnce({ rows: [] });

      const result = await createSlaPolicy('test-tenant', {
        name: 'Default SLA',
        entityType: 'issue',
        isDefault: true,
      });

      expect(result.is_default).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET is_default = false'),
        expect.any(Array)
      );
    });

    it('should rollback on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT fails

      await expect(
        createSlaPolicy('test-tenant', { name: 'Fail', entityType: 'issue' })
      ).rejects.toThrow('Insert failed');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('updateSlaPolicy', () => {
    it('should update policy fields', async () => {
      mockClientQuery
        // BEGIN
        .mockResolvedValueOnce({ rows: [] })
        // UPDATE
        .mockResolvedValueOnce({
          rows: [{ id: 'policy-1', name: 'Updated SLA' }],
        })
        // COMMIT
        .mockResolvedValueOnce({ rows: [] });

      const result = await updateSlaPolicy('test-tenant', 'policy-1', {
        name: 'Updated SLA',
      });

      expect(result?.name).toBe('Updated SLA');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'sla');
    });

    it('should return policy from getSlaPolicy if no updates provided', async () => {
      // For no updates, it calls getSlaPolicy which uses mockQuery
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'policy-1', name: 'Unchanged' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await updateSlaPolicy('test-tenant', 'policy-1', {});

      expect(result?.name).toBe('Unchanged');
    });

    it('should return null if policy not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE returns empty
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await updateSlaPolicy('test-tenant', 'nonexistent', {
        name: 'New Name',
      });

      expect(result).toBeNull();
    });

    it('should unset other defaults when setting as default', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        // Get entity type
        .mockResolvedValueOnce({ rows: [{ entity_type: 'issue' }] })
        // Unset other defaults
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // UPDATE
        .mockResolvedValueOnce({ rows: [{ id: 'policy-1', is_default: true }] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await updateSlaPolicy('test-tenant', 'policy-1', { isDefault: true });

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET is_default = false'),
        expect.arrayContaining(['issue', 'policy-1'])
      );
    });
  });

  describe('deleteSlaPolicy', () => {
    it('should delete non-default policy', async () => {
      // Check if default
      mockQuery.mockResolvedValueOnce({ rows: [{ is_default: false }] });
      // DELETE
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deleteSlaPolicy('test-tenant', 'policy-1');

      expect(result).toBe(true);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'sla');
    });

    it('should throw error when deleting default policy', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_default: true }] });

      await expect(
        deleteSlaPolicy('test-tenant', 'default-policy')
      ).rejects.toThrow('Cannot delete default SLA policy');
    });

    it('should return false if policy not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // check is_default - not found
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // DELETE returns 0

      const result = await deleteSlaPolicy('test-tenant', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // TARGET MANAGEMENT
  // ============================================
  describe('updateSlaTarget', () => {
    it('should update target fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'target-1', target_minutes: 30 }],
      });

      const result = await updateSlaTarget('test-tenant', 'target-1', {
        targetMinutes: 30,
      });

      expect(result?.target_minutes).toBe(30);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'sla');
    });

    it('should update warning threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'target-1', warning_threshold_percent: 90 }],
      });

      const result = await updateSlaTarget('test-tenant', 'target-1', {
        warningThresholdPercent: 90,
      });

      expect(result?.warning_threshold_percent).toBe(90);
    });

    it('should return current target if no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'target-1', target_minutes: 15 }],
      });

      const result = await updateSlaTarget('test-tenant', 'target-1', {});

      expect(result?.target_minutes).toBe(15);
      // Should only call SELECT, not UPDATE
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM'),
        ['target-1']
      );
    });

    it('should return null if target not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateSlaTarget('test-tenant', 'nonexistent', {
        targetMinutes: 30,
      });

      expect(result).toBeNull();
    });
  });

  describe('createSlaTarget', () => {
    it('should create target with default warning threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-target',
          policy_id: 'policy-1',
          metric_type: 'response_time',
          priority: 'critical',
          target_minutes: 15,
          warning_threshold_percent: 80,
        }],
      });

      const result = await createSlaTarget('test-tenant', 'policy-1', {
        metricType: 'response_time',
        priority: 'critical',
        targetMinutes: 15,
      });

      expect(result.warning_threshold_percent).toBe(80);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'sla');
    });

    it('should create target with custom warning threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-target',
          warning_threshold_percent: 90,
        }],
      });

      const result = await createSlaTarget('test-tenant', 'policy-1', {
        metricType: 'response_time',
        priority: 'high',
        targetMinutes: 30,
        warningThresholdPercent: 90,
      });

      expect(result.warning_threshold_percent).toBe(90);
    });
  });

  describe('deleteSlaTarget', () => {
    it('should delete target', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deleteSlaTarget('test-tenant', 'target-1');

      expect(result).toBe(true);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'sla');
    });

    it('should return false if target not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await deleteSlaTarget('test-tenant', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // SLA STATISTICS
  // ============================================
  describe('getSlaStats', () => {
    it('should get overall SLA statistics for issues', async () => {
      // Overall stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_issues: '100',
          breached_issues: '10',
          issues_within_sla: '80',
          avg_response_time_minutes: '25.5',
          avg_resolution_time_minutes: '180.3',
        }],
      });
      // By priority query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { priority: 'critical', total: '20', breached: '5' },
          { priority: 'high', total: '30', breached: '3' },
          { priority: 'medium', total: '50', breached: '2' },
        ],
      });
      // Approaching SLA query
      mockQuery.mockResolvedValueOnce({
        rows: [{ approaching: '5' }],
      });

      const result = await getSlaStats('test-tenant', 'issue');

      expect(result.total).toBe(100);
      expect(result.breached).toBe(10);
      expect(result.met).toBe(90);
      expect(result.met_percentage).toBe(90);
      expect(result.avg_response_time_minutes).toBe(26);
      expect(result.avg_resolution_time_minutes).toBe(180);
      expect(result.issues_approaching_sla).toBe(5);
      expect(result.by_priority).toHaveLength(3);
    });

    it('should get SLA statistics for problems', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_issues: '50', breached_issues: '5', issues_within_sla: '40', avg_response_time_minutes: '30', avg_resolution_time_minutes: '240' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ approaching: '2' }] });

      const result = await getSlaStats('test-tenant', 'problem');

      expect(result.total).toBe(50);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM tenant_test.problems'),
        expect.any(Array)
      );
    });

    it('should handle date range filter', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_issues: '30', breached_issues: '3', issues_within_sla: '25', avg_response_time_minutes: '20', avg_resolution_time_minutes: '150' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ approaching: '1' }] });

      await getSlaStats('test-tenant', 'issue', { start: startDate, end: endDate });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at BETWEEN $1 AND $2'),
        [startDate, endDate]
      );
    });

    it('should calculate breach percentage by priority', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_issues: '100', breached_issues: '20', issues_within_sla: '70', avg_response_time_minutes: '25', avg_resolution_time_minutes: '200' }],
        })
        .mockResolvedValueOnce({
          rows: [
            { priority: 'critical', total: '10', breached: '5' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ approaching: '0' }] });

      const result = await getSlaStats('test-tenant', 'issue');

      expect(result.by_priority[0].breach_percentage).toBe(50);
      expect(result.by_priority[0].met).toBe(5);
    });

    it('should return 100% met when no issues exist', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_issues: '0', breached_issues: '0', issues_within_sla: '0', avg_response_time_minutes: null, avg_resolution_time_minutes: null }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ approaching: '0' }] });

      const result = await getSlaStats('test-tenant', 'issue');

      expect(result.total).toBe(0);
      expect(result.met_percentage).toBe(100);
    });
  });

  // ============================================
  // SLA CONFIG FOR BREACH DETECTION
  // ============================================
  describe('getSlaConfigFromDb', () => {
    it('should get SLA config grouped by priority', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { priority: 'critical', metric_type: 'response_time', target_minutes: 15, warning_percent: 80 },
          { priority: 'critical', metric_type: 'resolution_time', target_minutes: 120, warning_percent: 80 },
          { priority: 'high', metric_type: 'response_time', target_minutes: 30, warning_percent: 75 },
          { priority: 'high', metric_type: 'resolution_time', target_minutes: 240, warning_percent: 75 },
        ],
      });

      const result = await getSlaConfigFromDb('test-tenant', 'issue');

      expect(result).toHaveLength(2);

      const critical = result.find(c => c.priority === 'critical');
      expect(critical?.responseTimeMinutes).toBe(15);
      expect(critical?.resolutionTimeMinutes).toBe(120);
      expect(critical?.warningThresholdPercent).toBe(80);

      const high = result.find(c => c.priority === 'high');
      expect(high?.responseTimeMinutes).toBe(30);
      expect(high?.resolutionTimeMinutes).toBe(240);
      expect(high?.warningThresholdPercent).toBe(75);
    });

    it('should use cache for SLA config', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getSlaConfigFromDb('test-tenant', 'issue');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test-tenant:sla:config:issue',
        expect.any(Function),
        { ttl: 1200 }
      );
    });

    it('should return empty array when no config exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getSlaConfigFromDb('test-tenant', 'problem');

      expect(result).toEqual([]);
    });

    it('should query for default policy targets', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getSlaConfigFromDb('test-tenant', 'issue');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('sp.is_default = true'),
        ['issue']
      );
    });
  });

  // ============================================
  // SERVICE EXPORT OBJECT
  // ============================================
  describe('slaService export', () => {
    it('should export all functions', () => {
      expect(slaService.listSlaPolicies).toBe(listSlaPolicies);
      expect(slaService.getSlaPolicy).toBe(getSlaPolicy);
      expect(slaService.createSlaPolicy).toBe(createSlaPolicy);
      expect(slaService.updateSlaPolicy).toBe(updateSlaPolicy);
      expect(slaService.deleteSlaPolicy).toBe(deleteSlaPolicy);
      expect(slaService.updateSlaTarget).toBe(updateSlaTarget);
      expect(slaService.createSlaTarget).toBe(createSlaTarget);
      expect(slaService.deleteSlaTarget).toBe(deleteSlaTarget);
      expect(slaService.getSlaStats).toBe(getSlaStats);
      expect(slaService.getSlaConfigFromDb).toBe(getSlaConfigFromDb);
    });
  });
});
