import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for DashboardService
 * Testing dashboard aggregation, caching, and metrics
 */

// Mock database
const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock tenant service
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
  },
}));

// Mock cache service
const mockGetOrSet = vi.fn();
const mockInvalidate = vi.fn();
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: (...args: unknown[]) => mockGetOrSet(...args),
    invalidate: (...args: unknown[]) => mockInvalidate(...args),
  },
}));

describe('DashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, execute the fetcher function (no caching)
    mockGetOrSet.mockImplementation((_key: string, fetcher: () => Promise<unknown>) => fetcher());
  });

  describe('getOverview', () => {
    it('should return aggregated overview statistics', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      // Mock all 5 parallel queries
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '50', open: '20', critical_open: '5' }] }) // issues
        .mockResolvedValueOnce({ rows: [{ total: '10', scheduled: '3', in_progress: '2' }] }) // changes
        .mockResolvedValueOnce({ rows: [{ total: '30', pending: '15' }] }) // requests
        .mockResolvedValueOnce({ rows: [{ avg_score: '75.5', critical: '2' }] }) // health
        .mockResolvedValueOnce({ rows: [{ total: '25' }] }); // applications

      const result = await dashboardService.getOverview('test-tenant');

      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('requests');
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('applications');
    });

    it('should use cache with 5-minute TTL', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] });

      await dashboardService.getOverview('test-tenant');

      expect(mockGetOrSet).toHaveBeenCalledWith(
        'test-tenant:dashboard:overview',
        expect.any(Function),
        { ttl: 300 }
      );
    });
  });

  describe('getIssueTrends', () => {
    it('should return issue trends for specified days', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2024-01-01', created: '5', resolved: '3' },
          { date: '2024-01-02', created: '8', resolved: '6' },
        ],
      });

      const result = await dashboardService.getIssueTrends('test-tenant', 7);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('created');
      expect(result[0]).toHaveProperty('resolved');
    });

    it('should default to 30 days', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dashboardService.getIssueTrends('test-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INTERVAL'),
        [30]
      );
    });

    it('should use cache with 10-minute TTL for trends', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dashboardService.getIssueTrends('test-tenant', 14);

      expect(mockGetOrSet).toHaveBeenCalledWith(
        'test-tenant:dashboard:trends:issues:14',
        expect.any(Function),
        { ttl: 600 }
      );
    });
  });

  describe('getIssuesByPriority', () => {
    it('should return issues grouped by priority', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { priority: 'critical', count: '5' },
          { priority: 'high', count: '10' },
          { priority: 'medium', count: '15' },
          { priority: 'low', count: '8' },
        ],
      });

      const result = await dashboardService.getIssuesByPriority('test-tenant');

      expect(result).toHaveLength(4);
      expect(result[0].priority).toBe('critical');
    });

    it('should only include open issues', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dashboardService.getIssuesByPriority('test-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("NOT IN ('resolved', 'closed')")
      );
    });
  });

  describe('getIssuesByStatus', () => {
    it('should return issues grouped by status', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { status: 'open', count: '20' },
          { status: 'in_progress', count: '15' },
          { status: 'resolved', count: '30' },
        ],
      });

      const result = await dashboardService.getIssuesByStatus('test-tenant');

      expect(result).toHaveLength(3);
    });
  });

  describe('getChangeSuccessRate', () => {
    it('should return change success rates over time', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2024-01-01', total: '10', success: '8', failed: '2', success_rate: '80.0' },
          { date: '2024-01-02', total: '5', success: '5', failed: '0', success_rate: '100.0' },
        ],
      });

      const result = await dashboardService.getChangeSuccessRate('test-tenant', 14);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('success_rate');
    });
  });

  describe('getHealthDistribution', () => {
    it('should return health score distribution', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          excellent: '10',
          good: '15',
          warning: '5',
          critical: '2',
        }],
      });

      const result = await dashboardService.getHealthDistribution('test-tenant');

      expect(result).toHaveProperty('excellent');
      expect(result).toHaveProperty('good');
      expect(result).toHaveProperty('warning');
      expect(result).toHaveProperty('critical');
    });
  });

  describe('getHealthByTier', () => {
    it('should return health metrics grouped by application tier', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { tier: 'P1', count: '5', avg_score: '85.2', min_score: '70', max_score: '95' },
          { tier: 'P2', count: '10', avg_score: '78.5', min_score: '60', max_score: '90' },
        ],
      });

      const result = await dashboardService.getHealthByTier('test-tenant');

      expect(result).toHaveLength(2);
      expect(result[0].tier).toBe('P1');
      expect(result[0]).toHaveProperty('avg_score');
    });
  });

  describe('getCriticalApplications', () => {
    it('should return applications with low health scores', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { application_id: 'app-1', app_name: 'Payment Service', tier: 'P1', overall_score: '45' },
          { application_id: 'app-2', app_name: 'Auth Service', tier: 'P1', overall_score: '55' },
        ],
      });

      const result = await dashboardService.getCriticalApplications('test-tenant', 5);

      expect(result).toHaveLength(2);
      expect(result[0].overall_score).toBe('45');
    });

    it('should respect limit parameter', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dashboardService.getCriticalApplications('test-tenant', 10);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        [10]
      );
    });
  });

  describe('getRequestsByItem', () => {
    it('should return request counts by catalog item', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { item_name: 'Laptop Request', count: '50', completed: '40', completion_rate: '80.0' },
          { item_name: 'Software Install', count: '30', completed: '28', completion_rate: '93.3' },
        ],
      });

      const result = await dashboardService.getRequestsByItem('test-tenant', 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('item_name');
      expect(result[0]).toHaveProperty('completion_rate');
    });
  });

  describe('getUpcomingChanges', () => {
    it('should return scheduled changes for next N days', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'change-1',
            reference_id: 'CHG-001',
            title: 'Deploy v2.0',
            risk_level: 'medium',
            scheduled_start: '2024-01-10T10:00:00Z',
            application_name: 'API Gateway',
          },
        ],
      });

      const result = await dashboardService.getUpcomingChanges('test-tenant', 7);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Deploy v2.0');
    });

    it('should filter by scheduled status', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dashboardService.getUpcomingChanges('test-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'scheduled'"),
        expect.any(Array)
      );
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activity from multiple sources', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { type: 'issue', id: 'issue-1', reference_id: 'INC-001', title: 'Server Down', status: 'open', action: 'created' },
          { type: 'change', id: 'change-1', reference_id: 'CHG-001', title: 'Deploy', status: 'scheduled', action: 'created' },
          { type: 'request', id: 'req-1', reference_id: 'REQ-001', title: 'Service Request', status: 'submitted', action: 'created' },
        ],
      });

      const result = await dashboardService.getRecentActivity('test-tenant', 20);

      expect(result).toHaveLength(3);
      expect(result.map((r: { type: string }) => r.type)).toContain('issue');
      expect(result.map((r: { type: string }) => r.type)).toContain('change');
      expect(result.map((r: { type: string }) => r.type)).toContain('request');
    });

    it('should use 1-minute TTL for activity', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dashboardService.getRecentActivity('test-tenant');

      expect(mockGetOrSet).toHaveBeenCalledWith(
        expect.stringContaining('activity'),
        expect.any(Function),
        { ttl: 60 }
      );
    });
  });

  describe('getSlaCompliance', () => {
    it('should return SLA compliance metrics by priority', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { priority: 'critical', total: '10', within_sla: '8', breached: '2', compliance_rate: '80.0' },
          { priority: 'high', total: '20', within_sla: '18', breached: '2', compliance_rate: '90.0' },
        ],
      });

      const result = await dashboardService.getSlaCompliance('test-tenant');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('compliance_rate');
    });
  });

  describe('getCloudCostTrends', () => {
    it('should return cloud cost trends over months', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery.mockResolvedValueOnce({
        rows: [
          { month: '2024-01-01', total_cost: '10000', avg_change_percent: '5.2' },
          { month: '2024-02-01', total_cost: '10500', avg_change_percent: '5.0' },
        ],
      });

      const result = await dashboardService.getCloudCostTrends('test-tenant', 6);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('total_cost');
    });
  });

  describe('getMobileSummary', () => {
    it('should return mobile-optimized summary data', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ open: '15', critical: '3' }] }) // issues
        .mockResolvedValueOnce({ rows: [{ active: '5' }] }) // changes
        .mockResolvedValueOnce({ rows: [{ pending: '10' }] }) // requests
        .mockResolvedValueOnce({ rows: [{ avg_score: '78', critical_apps: '2' }] }); // health

      const result = await dashboardService.getMobileSummary('test-tenant');

      expect(result).toEqual({
        openIssues: 15,
        criticalIssues: 3,
        activeChanges: 5,
        pendingRequests: 10,
        avgHealthScore: 78,
        criticalApps: 2,
      });
    });

    it('should handle null values gracefully', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ open: null, critical: null }] })
        .mockResolvedValueOnce({ rows: [{ active: null }] })
        .mockResolvedValueOnce({ rows: [{ pending: null }] })
        .mockResolvedValueOnce({ rows: [{ avg_score: null, critical_apps: null }] });

      const result = await dashboardService.getMobileSummary('test-tenant');

      expect(result.openIssues).toBe(0);
      expect(result.avgHealthScore).toBe(0);
    });

    it('should use 3-minute TTL for mobile', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      mockQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] });

      await dashboardService.getMobileSummary('test-tenant');

      expect(mockGetOrSet).toHaveBeenCalledWith(
        'test-tenant:dashboard:mobile:summary',
        expect.any(Function),
        { ttl: 180 }
      );
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate all dashboard cache when category is "all"', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.invalidateCache('test-tenant', 'all');

      expect(mockInvalidate).toHaveBeenCalledWith('cache:test-tenant:dashboard:*');
    });

    it('should invalidate all dashboard cache when no category specified', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.invalidateCache('test-tenant');

      expect(mockInvalidate).toHaveBeenCalledWith('cache:test-tenant:dashboard:*');
    });

    it('should invalidate specific category', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.invalidateCache('test-tenant', 'issues');

      expect(mockInvalidate).toHaveBeenCalledWith('cache:test-tenant:dashboard:*issues*');
    });

    it('should invalidate health category specifically', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.invalidateCache('test-tenant', 'health');

      expect(mockInvalidate).toHaveBeenCalledWith('cache:test-tenant:dashboard:*health*');
    });
  });
});

describe('Dashboard Cache Keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrSet.mockImplementation((_key: string, fetcher: () => Promise<unknown>) => fetcher());
  });

  it('should use tenant-specific cache keys', async () => {
    const { dashboardService } = await import('../../../src/services/dashboard.js');

    mockQuery
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] });

    await dashboardService.getOverview('tenant-alpha');

    expect(mockGetOrSet).toHaveBeenCalledWith(
      'tenant-alpha:dashboard:overview',
      expect.any(Function),
      expect.any(Object)
    );
  });

  it('should include parameters in cache keys for parameterized queries', async () => {
    const { dashboardService } = await import('../../../src/services/dashboard.js');

    mockQuery.mockResolvedValueOnce({ rows: [] });

    await dashboardService.getCriticalApplications('test-tenant', 10);

    expect(mockGetOrSet).toHaveBeenCalledWith(
      'test-tenant:dashboard:health:critical:10',
      expect.any(Function),
      expect.any(Object)
    );
  });
});

describe('Dashboard SQL Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrSet.mockImplementation((_key: string, fetcher: () => Promise<unknown>) => fetcher());
  });

  it('should use correct schema name in queries', async () => {
    const { dashboardService } = await import('../../../src/services/dashboard.js');

    mockQuery.mockResolvedValueOnce({ rows: [] });

    await dashboardService.getIssuesByStatus('acme-corp');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('tenant_acme_corp')
    );
  });

  it('should handle empty result sets', async () => {
    const { dashboardService } = await import('../../../src/services/dashboard.js');

    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await dashboardService.getIssueTrends('test-tenant');

    expect(result).toEqual([]);
  });
});
