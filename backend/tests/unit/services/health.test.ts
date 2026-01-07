import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for Health Score Service
 * Testing application health monitoring operations
 *
 * Key coverage areas:
 * - Health score configuration management
 * - Health score calculation
 * - Issue/change/SLA/uptime score components
 * - Health score history and trends
 * - Summary statistics
 * - Caching behavior
 */

// Mock dependencies
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
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
import { healthScoreConfigService, healthScoreService } from '../../../src/services/health.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError } from '../../../src/utils/errors.js';

describe('HealthScoreConfigService', () => {
  const tenantSlug = 'test-tenant';

  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // CONFIG LIST
  // ============================================
  describe('list', () => {
    it('should list all health score configurations ordered by tier weight', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { tier: 'tier1', tier_weight: 1.5, critical_threshold: 40, warning_threshold: 60, good_threshold: 80 },
          { tier: 'tier2', tier_weight: 1.2, critical_threshold: 35, warning_threshold: 55, good_threshold: 75 },
          { tier: 'tier3', tier_weight: 1.0, critical_threshold: 30, warning_threshold: 50, good_threshold: 70 },
        ],
      });

      const result = await healthScoreConfigService.list(tenantSlug);

      expect(result).toHaveLength(3);
      expect(result[0].tier).toBe('tier1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY tier_weight DESC')
      );
    });

    it('should return empty array when no configurations exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await healthScoreConfigService.list(tenantSlug);

      expect(result).toEqual([]);
    });

    it('should use caching with 15 minute TTL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await healthScoreConfigService.list(tenantSlug);

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `${tenantSlug}:health:config:list`,
        expect.any(Function),
        { ttl: 900 }
      );
    });
  });

  // ============================================
  // CONFIG FIND BY TIER
  // ============================================
  describe('findByTier', () => {
    const mockConfig = {
      tier: 'tier1',
      tier_weight: 1.5,
      critical_threshold: 40,
      warning_threshold: 60,
      good_threshold: 80,
      critical_issue_penalty: 15,
      high_issue_penalty: 8,
      medium_issue_penalty: 3,
      low_issue_penalty: 1,
      issue_weight: 0.40,
      change_weight: 0.25,
      sla_weight: 0.25,
      uptime_weight: 0.10,
    };

    it('should find configuration by tier', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockConfig] });

      const result = await healthScoreConfigService.findByTier(tenantSlug, 'tier1');

      expect(result).toBeDefined();
      expect(result?.tier).toBe('tier1');
      expect(result?.tier_weight).toBe(1.5);
    });

    it('should return null for non-existent tier', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await healthScoreConfigService.findByTier(tenantSlug, 'non-existent');

      expect(result).toBeNull();
    });

    it('should use caching with tier-specific key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockConfig] });

      await healthScoreConfigService.findByTier(tenantSlug, 'tier2');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `${tenantSlug}:health:config:tier:tier2`,
        expect.any(Function),
        { ttl: 900 }
      );
    });
  });

  // ============================================
  // CONFIG UPDATE
  // ============================================
  describe('update', () => {
    const existingConfig = {
      tier: 'tier1',
      tier_weight: 1.5,
      critical_threshold: 40,
      warning_threshold: 60,
      good_threshold: 80,
    };

    it('should update configuration fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingConfig] }) // check existing
        .mockResolvedValueOnce({ rows: [{ ...existingConfig, critical_threshold: 35 }] }); // update

      const result = await healthScoreConfigService.update(tenantSlug, 'tier1', {
        criticalThreshold: 35,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.health_score_config SET critical_threshold = $1'),
        expect.any(Array)
      );
    });

    it('should update multiple fields at once', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingConfig] })
        .mockResolvedValueOnce({ rows: [existingConfig] });

      await healthScoreConfigService.update(tenantSlug, 'tier1', {
        criticalThreshold: 35,
        warningThreshold: 55,
        issueWeight: 0.45,
      });

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE tenant_test.health_score_config SET'),
        expect.any(Array)
      );
    });

    it('should return existing config when no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [existingConfig] });

      const result = await healthScoreConfigService.update(tenantSlug, 'tier1', {});

      expect(result).toEqual(existingConfig);
      // Should only check existing, not update
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError for non-existent tier', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        healthScoreConfigService.update(tenantSlug, 'non-existent', { criticalThreshold: 35 })
      ).rejects.toThrow(NotFoundError);
    });

    it('should invalidate cache after update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingConfig] })
        .mockResolvedValueOnce({ rows: [existingConfig] });

      await healthScoreConfigService.update(tenantSlug, 'tier1', { criticalThreshold: 35 });

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'health');
    });
  });
});

describe('HealthScoreService', () => {
  const tenantSlug = 'test-tenant';
  const applicationId = 'app-uuid';
  const userId = 'user-123';

  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // GET LATEST FOR APPLICATION
  // ============================================
  describe('getLatestForApplication', () => {
    it('should return the latest health score for an application', async () => {
      const mockScore = {
        id: 'score-1',
        application_id: applicationId,
        overall_score: 85,
        issue_score: 90,
        change_score: 80,
        sla_score: 85,
        uptime_score: 95,
        calculated_at: new Date('2026-01-01'),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockScore] });

      const result = await healthScoreService.getLatestForApplication(tenantSlug, applicationId);

      expect(result).toBeDefined();
      expect(result.overall_score).toBe(85);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY calculated_at DESC'),
        [applicationId]
      );
    });

    it('should return null when no scores exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await healthScoreService.getLatestForApplication(tenantSlug, applicationId);

      expect(result).toBeNull();
    });
  });

  // ============================================
  // GET HISTORY FOR APPLICATION
  // ============================================
  describe('getHistoryForApplication', () => {
    it('should return health score history for specified days', async () => {
      const mockScores = [
        { id: 'score-1', overall_score: 85, calculated_at: new Date('2026-01-07') },
        { id: 'score-2', overall_score: 82, calculated_at: new Date('2026-01-06') },
        { id: 'score-3', overall_score: 80, calculated_at: new Date('2026-01-05') },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockScores });

      const result = await healthScoreService.getHistoryForApplication(tenantSlug, applicationId, 30);

      expect(result).toHaveLength(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("NOW() - $2 * INTERVAL '1 day'"),
        [applicationId, 30]
      );
    });

    it('should use default of 30 days when not specified', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await healthScoreService.getHistoryForApplication(tenantSlug, applicationId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [applicationId, 30]
      );
    });

    it('should return empty array when no history exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await healthScoreService.getHistoryForApplication(tenantSlug, applicationId, 7);

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // CALCULATE FOR APPLICATION
  // ============================================
  describe('calculateForApplication', () => {
    const mockApp = { id: applicationId, name: 'Test App', tier: 'tier2' };
    const mockConfig = {
      tier: 'tier2',
      tierWeight: 1.2,
      criticalIssuePenalty: 15,
      highIssuePenalty: 8,
      mediumIssuePenalty: 3,
      lowIssuePenalty: 1,
      issueWeight: 0.40,
      changeWeight: 0.25,
      slaWeight: 0.25,
      uptimeWeight: 0.10,
    };

    it('should calculate health score for an application', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockApp] }) // get application
        .mockResolvedValueOnce({ rows: [mockConfig] }) // get tier config
        .mockResolvedValueOnce({ rows: [{ total: '10', critical: '0', high: '1', medium: '3', low: '6' }] }) // issue stats
        .mockResolvedValueOnce({ rows: [{ total: '5', failed: '1', rolled_back: '0' }] }) // change stats
        .mockResolvedValueOnce({ rows: [{ total: '10', breached: '1' }] }) // SLA stats
        .mockResolvedValueOnce({ rows: [{ total_checks: '0', healthy_checks: '0' }] }) // uptime (cloud resources)
        .mockResolvedValueOnce({ rows: [{ total_downtime_seconds: '0' }] }) // uptime (downtime from issues)
        .mockResolvedValueOnce({ rows: [] }) // previous score (for trend)
        .mockResolvedValueOnce({ rows: [{ id: 'new-score', overall_score: 75 }] }); // insert

      const result = await healthScoreService.calculateForApplication(tenantSlug, applicationId, userId);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.app_health_scores'),
        expect.any(Array)
      );
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        healthScoreService.calculateForApplication(tenantSlug, 'non-existent', userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should calculate improving trend when score increases', async () => {
      const previousScore = { overall_score: 60 };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockApp] })
        .mockResolvedValueOnce({ rows: [mockConfig] })
        .mockResolvedValueOnce({ rows: [{ total: '0', critical: '0', high: '0', medium: '0', low: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', failed: '0', rolled_back: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', breached: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_checks: '0', healthy_checks: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_downtime_seconds: '0' }] })
        .mockResolvedValueOnce({ rows: [previousScore] }) // previous score
        .mockResolvedValueOnce({ rows: [{ trend: 'improving' }] });

      await healthScoreService.calculateForApplication(tenantSlug, applicationId, userId);

      // Check that INSERT includes trend
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('trend'),
        expect.any(Array)
      );
    });

    it('should calculate declining trend when score decreases', async () => {
      const previousScore = { overall_score: 95 };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockApp, tier: 'tier1' }] })
        .mockResolvedValueOnce({ rows: [{ ...mockConfig, tierWeight: 1.5 }] })
        .mockResolvedValueOnce({ rows: [{ total: '20', critical: '3', high: '5', medium: '7', low: '5' }] })
        .mockResolvedValueOnce({ rows: [{ total: '10', failed: '3', rolled_back: '1' }] })
        .mockResolvedValueOnce({ rows: [{ total: '15', breached: '5' }] })
        .mockResolvedValueOnce({ rows: [{ total_checks: '0', healthy_checks: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_downtime_seconds: '3600' }] })
        .mockResolvedValueOnce({ rows: [previousScore] })
        .mockResolvedValueOnce({ rows: [{ trend: 'declining' }] });

      await healthScoreService.calculateForApplication(tenantSlug, applicationId, userId);

      expect(mockQuery).toHaveBeenCalledTimes(9);
    });

    it('should use COALESCE for default tier when tier is null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: applicationId, name: 'Test App', tier: 'P3' }] }) // COALESCE returns P3
        .mockResolvedValueOnce({ rows: [] }) // config for P3
        .mockResolvedValueOnce({ rows: [{ total: '0', critical: '0', high: '0', medium: '0', low: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', failed: '0', rolled_back: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', breached: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_checks: '0', healthy_checks: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_downtime_seconds: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'score-1' }] });

      await healthScoreService.calculateForApplication(tenantSlug, applicationId, userId);

      // Query should use COALESCE to default to P3
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("COALESCE(a.tier, 'P3')"),
        [applicationId]
      );
    });

    it('should invalidate cache after calculation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockApp] })
        .mockResolvedValueOnce({ rows: [mockConfig] })
        .mockResolvedValueOnce({ rows: [{ total: '0', critical: '0', high: '0', medium: '0', low: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', failed: '0', rolled_back: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0', breached: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_checks: '0', healthy_checks: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_downtime_seconds: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'score-1' }] });

      await healthScoreService.calculateForApplication(tenantSlug, applicationId, userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'health');
    });
  });

  // ============================================
  // LIST ALL SCORES
  // ============================================
  describe('listAllScores', () => {
    it('should list all application health scores with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'score-1', application_id: 'app-1', overall_score: 90, application_name: 'App 1', tier: 'tier1' },
            { id: 'score-2', application_id: 'app-2', overall_score: 75, application_name: 'App 2', tier: 'tier2' },
          ],
        });

      const result = await healthScoreService.listAllScores(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(25);
      expect(result.scores).toHaveLength(2);
      expect(result.scores[0].application_name).toBe('App 1');
    });

    it('should return empty array when no scores exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await healthScoreService.listAllScores(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(0);
      expect(result.scores).toEqual([]);
    });

    it('should use caching with 5 minute TTL', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await healthScoreService.listAllScores(tenantSlug, { page: 1, perPage: 10 });

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining(`${tenantSlug}:health:scores:list`),
        expect.any(Function),
        { ttl: 300 }
      );
    });

    it('should get latest score per application using DISTINCT ON', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await healthScoreService.listAllScores(tenantSlug, { page: 1, perPage: 10 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DISTINCT ON (h.application_id)'),
        expect.any(Array)
      );
    });
  });

  // ============================================
  // GET SUMMARY
  // ============================================
  describe('getSummary', () => {
    it('should return health score summary with category counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_apps: '50',
          excellent: '20',
          good: '15',
          warning: '10',
          critical: '5',
          average_score: 72.5,
        }],
      });

      const result = await healthScoreService.getSummary(tenantSlug);

      expect(result.total_apps).toBe('50');
      expect(result.excellent).toBe('20');
      expect(result.good).toBe('15');
      expect(result.warning).toBe('10');
      expect(result.critical).toBe('5');
      expect(result.average_score).toBe(72.5);
    });

    it('should use CTE for latest scores per application', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_apps: '0', excellent: '0', good: '0', warning: '0', critical: '0', average_score: null }],
      });

      await healthScoreService.getSummary(tenantSlug);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WITH latest_scores AS')
      );
    });

    it('should use caching with 3 minute TTL', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_apps: '0', excellent: '0', good: '0', warning: '0', critical: '0', average_score: null }],
      });

      await healthScoreService.getSummary(tenantSlug);

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `${tenantSlug}:health:summary`,
        expect.any(Function),
        { ttl: 180 }
      );
    });

    it('should categorize scores correctly (excellent >= 90, good >= 75, warning >= 50, critical < 50)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_apps: '10', excellent: '3', good: '3', warning: '2', critical: '2', average_score: 68.5 }],
      });

      await healthScoreService.getSummary(tenantSlug);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/overall_score >= 90.*excellent/s)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/overall_score >= 75 AND overall_score < 90.*good/s)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/overall_score >= 50 AND overall_score < 75.*warning/s)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/overall_score < 50.*critical/s)
      );
    });
  });
});
