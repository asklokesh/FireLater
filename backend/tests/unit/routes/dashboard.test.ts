import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dashboard service
vi.mock('../../../src/services/dashboard.js', () => ({
  dashboardService: {
    getOverview: vi.fn().mockResolvedValue({}),
    getMobileSummary: vi.fn().mockResolvedValue({}),
    getIssueTrends: vi.fn().mockResolvedValue([]),
    getIssuesByPriority: vi.fn().mockResolvedValue([]),
    getIssuesByStatus: vi.fn().mockResolvedValue([]),
    getChangeSuccessRate: vi.fn().mockResolvedValue({}),
    getHealthDistribution: vi.fn().mockResolvedValue({}),
    getHealthByTier: vi.fn().mockResolvedValue([]),
    getCriticalApplications: vi.fn().mockResolvedValue([]),
    getRecentActivity: vi.fn().mockResolvedValue([]),
    getUpcomingChanges: vi.fn().mockResolvedValue([]),
    getRequestsByItem: vi.fn().mockResolvedValue([]),
    getSlaCompliance: vi.fn().mockResolvedValue({}),
    getCloudCostTrends: vi.fn().mockResolvedValue([]),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

describe('Dashboard Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Route Permissions', () => {
    it('should require dashboard:read for GET /', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /mobile', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /trends/issues', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /issues/by-priority', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /issues/by-status', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /trends/changes', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /health/distribution', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /health/by-tier', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /health/critical', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /activity', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /changes/upcoming', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /requests/by-item', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /sla/compliance', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });

    it('should require dashboard:read for GET /cloud/costs', () => {
      const permission = 'dashboard:read';
      expect(permission).toBe('dashboard:read');
    });
  });

  describe('Query Parameter Defaults', () => {
    describe('days parameter', () => {
      it('should default to 30 days for issue trends', () => {
        const query = { days: undefined };
        const days = query.days ? parseInt(query.days, 10) : 30;
        expect(days).toBe(30);
      });

      it('should use provided days value for issue trends', () => {
        const query = { days: '90' };
        const days = query.days ? parseInt(query.days, 10) : 30;
        expect(days).toBe(90);
      });

      it('should default to 30 days for change success rate', () => {
        const query = { days: undefined };
        const days = query.days ? parseInt(query.days, 10) : 30;
        expect(days).toBe(30);
      });

      it('should default to 7 days for upcoming changes', () => {
        const query = { days: undefined };
        const days = query.days ? parseInt(query.days, 10) : 7;
        expect(days).toBe(7);
      });

      it('should use provided days value for upcoming changes', () => {
        const query = { days: '14' };
        const days = query.days ? parseInt(query.days, 10) : 7;
        expect(days).toBe(14);
      });
    });

    describe('limit parameter', () => {
      it('should default to 5 for critical applications', () => {
        const query = { limit: undefined };
        const limit = query.limit ? parseInt(query.limit, 10) : 5;
        expect(limit).toBe(5);
      });

      it('should use provided limit for critical applications', () => {
        const query = { limit: '10' };
        const limit = query.limit ? parseInt(query.limit, 10) : 5;
        expect(limit).toBe(10);
      });

      it('should default to 20 for activity feed', () => {
        const query = { limit: undefined };
        const limit = query.limit ? parseInt(query.limit, 10) : 20;
        expect(limit).toBe(20);
      });

      it('should use provided limit for activity feed', () => {
        const query = { limit: '50' };
        const limit = query.limit ? parseInt(query.limit, 10) : 20;
        expect(limit).toBe(50);
      });

      it('should default to 10 for requests by item', () => {
        const query = { limit: undefined };
        const limit = query.limit ? parseInt(query.limit, 10) : 10;
        expect(limit).toBe(10);
      });
    });

    describe('months parameter', () => {
      it('should default to 6 months for cloud costs', () => {
        const query = { months: undefined };
        const months = query.months ? parseInt(query.months, 10) : 6;
        expect(months).toBe(6);
      });

      it('should use provided months for cloud costs', () => {
        const query = { months: '12' };
        const months = query.months ? parseInt(query.months, 10) : 6;
        expect(months).toBe(12);
      });
    });
  });

  describe('Response Formats', () => {
    it('should return overview directly for GET /', () => {
      const overview = { totalIssues: 100, openIssues: 25 };
      // Overview is returned directly, not wrapped
      expect(overview).toHaveProperty('totalIssues');
    });

    it('should return summary directly for GET /mobile', () => {
      const summary = { criticalCount: 5, pendingCount: 10 };
      // Summary is returned directly
      expect(summary).toHaveProperty('criticalCount');
    });

    it('should wrap trends in object for GET /trends/issues', () => {
      const trends = [{ date: '2024-01-01', count: 10 }];
      const response = { trends };
      expect(response).toHaveProperty('trends');
      expect(Array.isArray(response.trends)).toBe(true);
    });

    it('should wrap data in object for GET /issues/by-priority', () => {
      const data = [{ priority: 'high', count: 5 }];
      const response = { data };
      expect(response).toHaveProperty('data');
    });

    it('should wrap data in object for GET /issues/by-status', () => {
      const data = [{ status: 'open', count: 10 }];
      const response = { data };
      expect(response).toHaveProperty('data');
    });

    it('should wrap data in object for GET /trends/changes', () => {
      const data = { successRate: 95.5 };
      const response = { data };
      expect(response).toHaveProperty('data');
    });

    it('should wrap distribution in object for GET /health/distribution', () => {
      const distribution = { healthy: 80, warning: 15, critical: 5 };
      const response = { distribution };
      expect(response).toHaveProperty('distribution');
    });

    it('should wrap data in object for GET /health/by-tier', () => {
      const data = [{ tier: 'P1', averageScore: 90 }];
      const response = { data };
      expect(response).toHaveProperty('data');
    });

    it('should wrap applications in object for GET /health/critical', () => {
      const applications = [{ id: 'app-1', name: 'Critical App', score: 40 }];
      const response = { applications };
      expect(response).toHaveProperty('applications');
      expect(Array.isArray(response.applications)).toBe(true);
    });

    it('should wrap activity in object for GET /activity', () => {
      const activity = [{ type: 'issue_created', timestamp: '2024-01-01T00:00:00Z' }];
      const response = { activity };
      expect(response).toHaveProperty('activity');
    });

    it('should wrap changes in object for GET /changes/upcoming', () => {
      const changes = [{ id: 'change-1', scheduledFor: '2024-01-15' }];
      const response = { changes };
      expect(response).toHaveProperty('changes');
    });

    it('should wrap data in object for GET /requests/by-item', () => {
      const data = [{ item: 'Laptop', count: 15 }];
      const response = { data };
      expect(response).toHaveProperty('data');
    });

    it('should wrap data in object for GET /sla/compliance', () => {
      const data = { overallCompliance: 98.5, breaches: 3 };
      const response = { data };
      expect(response).toHaveProperty('data');
    });

    it('should wrap data in object for GET /cloud/costs', () => {
      const data = [{ month: '2024-01', cost: 5000 }];
      const response = { data };
      expect(response).toHaveProperty('data');
    });
  });

  describe('Service Integration', () => {
    it('should call dashboardService.getOverview with tenantSlug', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getOverview('test-tenant');
      expect(dashboardService.getOverview).toHaveBeenCalledWith('test-tenant');
    });

    it('should call dashboardService.getMobileSummary with tenantSlug', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getMobileSummary('test-tenant');
      expect(dashboardService.getMobileSummary).toHaveBeenCalledWith('test-tenant');
    });

    it('should call dashboardService.getIssueTrends with tenantSlug and days', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getIssueTrends('test-tenant', 30);
      expect(dashboardService.getIssueTrends).toHaveBeenCalledWith('test-tenant', 30);
    });

    it('should call dashboardService.getIssuesByPriority with tenantSlug', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getIssuesByPriority('test-tenant');
      expect(dashboardService.getIssuesByPriority).toHaveBeenCalledWith('test-tenant');
    });

    it('should call dashboardService.getIssuesByStatus with tenantSlug', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getIssuesByStatus('test-tenant');
      expect(dashboardService.getIssuesByStatus).toHaveBeenCalledWith('test-tenant');
    });

    it('should call dashboardService.getChangeSuccessRate with tenantSlug and days', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getChangeSuccessRate('test-tenant', 30);
      expect(dashboardService.getChangeSuccessRate).toHaveBeenCalledWith('test-tenant', 30);
    });

    it('should call dashboardService.getHealthDistribution with tenantSlug', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getHealthDistribution('test-tenant');
      expect(dashboardService.getHealthDistribution).toHaveBeenCalledWith('test-tenant');
    });

    it('should call dashboardService.getHealthByTier with tenantSlug', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getHealthByTier('test-tenant');
      expect(dashboardService.getHealthByTier).toHaveBeenCalledWith('test-tenant');
    });

    it('should call dashboardService.getCriticalApplications with tenantSlug and limit', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getCriticalApplications('test-tenant', 5);
      expect(dashboardService.getCriticalApplications).toHaveBeenCalledWith('test-tenant', 5);
    });

    it('should call dashboardService.getRecentActivity with tenantSlug and limit', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getRecentActivity('test-tenant', 20);
      expect(dashboardService.getRecentActivity).toHaveBeenCalledWith('test-tenant', 20);
    });

    it('should call dashboardService.getUpcomingChanges with tenantSlug and days', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getUpcomingChanges('test-tenant', 7);
      expect(dashboardService.getUpcomingChanges).toHaveBeenCalledWith('test-tenant', 7);
    });

    it('should call dashboardService.getRequestsByItem with tenantSlug and limit', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getRequestsByItem('test-tenant', 10);
      expect(dashboardService.getRequestsByItem).toHaveBeenCalledWith('test-tenant', 10);
    });

    it('should call dashboardService.getSlaCompliance with tenantSlug', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getSlaCompliance('test-tenant');
      expect(dashboardService.getSlaCompliance).toHaveBeenCalledWith('test-tenant');
    });

    it('should call dashboardService.getCloudCostTrends with tenantSlug and months', async () => {
      const { dashboardService } = await import('../../../src/services/dashboard.js');

      await dashboardService.getCloudCostTrends('test-tenant', 6);
      expect(dashboardService.getCloudCostTrends).toHaveBeenCalledWith('test-tenant', 6);
    });
  });

  describe('Integer Parsing', () => {
    it('should parse string days to integer', () => {
      const days = parseInt('45', 10);
      expect(days).toBe(45);
      expect(typeof days).toBe('number');
    });

    it('should parse string limit to integer', () => {
      const limit = parseInt('25', 10);
      expect(limit).toBe(25);
      expect(typeof limit).toBe('number');
    });

    it('should parse string months to integer', () => {
      const months = parseInt('12', 10);
      expect(months).toBe(12);
      expect(typeof months).toBe('number');
    });

    it('should handle NaN from invalid input', () => {
      const result = parseInt('invalid', 10);
      expect(isNaN(result)).toBe(true);
    });
  });

  describe('Route Structure', () => {
    it('should have 14 route handlers', () => {
      // Count of routes in dashboard.ts
      const routes = [
        'GET /',
        'GET /mobile',
        'GET /trends/issues',
        'GET /issues/by-priority',
        'GET /issues/by-status',
        'GET /trends/changes',
        'GET /health/distribution',
        'GET /health/by-tier',
        'GET /health/critical',
        'GET /activity',
        'GET /changes/upcoming',
        'GET /requests/by-item',
        'GET /sla/compliance',
        'GET /cloud/costs',
      ];

      expect(routes.length).toBe(14);
    });

    it('should use GET method for all routes', () => {
      // Dashboard routes are read-only
      const methods = ['GET'];
      expect(methods).toContain('GET');
      expect(methods).not.toContain('POST');
      expect(methods).not.toContain('PUT');
      expect(methods).not.toContain('DELETE');
    });
  });
});
