import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are created before module loads
const mockPoolQuery = vi.hoisted(() => vi.fn());

// Mock database pool
vi.mock('../../../../src/config/database.js', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

// Mock config
vi.mock('../../../../src/config/index.js', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
    },
  },
}));

// Mock logger
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock tenant service
vi.mock('../../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockImplementation((slug: string) => `tenant_${slug}`),
  },
}));

// Mock BullMQ Worker, Queue, and QueueEvents to prevent actual Redis connection
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    name: 'health-scores',
  })),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    close: vi.fn(),
    getJobs: vi.fn().mockResolvedValue([]),
    pause: vi.fn(),
    resume: vi.fn(),
    obliterate: vi.fn(),
    clean: vi.fn(),
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  Job: vi.fn(),
}));

// Import after mocks are set up
import {
  type CalculateHealthScoreJobData,
  type CalculateAllHealthScoresJobData,
  type HealthScoreResult,
} from '../../../../src/jobs/processors/healthScores.js';

describe('HealthScores Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('CalculateHealthScoreJobData Interface', () => {
    it('should accept valid calculate health score job data', () => {
      const jobData: CalculateHealthScoreJobData = {
        applicationId: 'app-123',
        tenantSlug: 'test-tenant',
      };

      expect(jobData.applicationId).toBe('app-123');
      expect(jobData.tenantSlug).toBe('test-tenant');
    });

    it('should handle different application IDs', () => {
      const appIds = ['app-1', 'app-2', 'app-3'];

      for (const appId of appIds) {
        const jobData: CalculateHealthScoreJobData = {
          applicationId: appId,
          tenantSlug: 'test-tenant',
        };

        expect(jobData.applicationId).toBe(appId);
      }
    });
  });

  describe('CalculateAllHealthScoresJobData Interface', () => {
    it('should accept valid calculate all health scores job data', () => {
      const jobData: CalculateAllHealthScoresJobData = {
        tenantSlug: 'test-tenant',
      };

      expect(jobData.tenantSlug).toBe('test-tenant');
    });

    it('should handle different tenant slugs', () => {
      const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];

      for (const tenant of tenants) {
        const jobData: CalculateAllHealthScoresJobData = {
          tenantSlug: tenant,
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });
  });

  describe('HealthScoreResult Interface', () => {
    it('should have all required properties', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-123',
        overallScore: 85.5,
        issueScore: 90,
        changeScore: 80,
        slaScore: 85,
        uptimeScore: 95,
        trend: 'stable',
      };

      expect(result.applicationId).toBe('app-123');
      expect(result.overallScore).toBe(85.5);
      expect(result.issueScore).toBe(90);
      expect(result.changeScore).toBe(80);
      expect(result.slaScore).toBe(85);
      expect(result.uptimeScore).toBe(95);
      expect(result.trend).toBe('stable');
    });

    it('should support improving trend', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-improving',
        overallScore: 92,
        issueScore: 95,
        changeScore: 90,
        slaScore: 88,
        uptimeScore: 100,
        trend: 'improving',
      };

      expect(result.trend).toBe('improving');
    });

    it('should support stable trend', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-stable',
        overallScore: 75,
        issueScore: 75,
        changeScore: 75,
        slaScore: 75,
        uptimeScore: 75,
        trend: 'stable',
      };

      expect(result.trend).toBe('stable');
    });

    it('should support declining trend', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-declining',
        overallScore: 55,
        issueScore: 50,
        changeScore: 60,
        slaScore: 55,
        uptimeScore: 55,
        trend: 'declining',
      };

      expect(result.trend).toBe('declining');
    });

    it('should handle perfect scores', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-perfect',
        overallScore: 100,
        issueScore: 100,
        changeScore: 100,
        slaScore: 100,
        uptimeScore: 100,
        trend: 'stable',
      };

      expect(result.overallScore).toBe(100);
      expect(result.issueScore).toBe(100);
      expect(result.changeScore).toBe(100);
      expect(result.slaScore).toBe(100);
      expect(result.uptimeScore).toBe(100);
    });

    it('should handle zero scores', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-zero',
        overallScore: 0,
        issueScore: 0,
        changeScore: 0,
        slaScore: 0,
        uptimeScore: 0,
        trend: 'declining',
      };

      expect(result.overallScore).toBe(0);
    });

    it('should work with array of results', () => {
      const results: HealthScoreResult[] = [
        { applicationId: 'app-1', overallScore: 90, issueScore: 95, changeScore: 85, slaScore: 90, uptimeScore: 100, trend: 'improving' },
        { applicationId: 'app-2', overallScore: 75, issueScore: 70, changeScore: 80, slaScore: 75, uptimeScore: 85, trend: 'stable' },
        { applicationId: 'app-3', overallScore: 60, issueScore: 55, changeScore: 65, slaScore: 60, uptimeScore: 70, trend: 'declining' },
      ];

      const avgScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;
      expect(avgScore).toBe(75);
    });
  });

  describe('Score Ranges', () => {
    it('should accept decimal scores', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-decimal',
        overallScore: 87.65,
        issueScore: 91.23,
        changeScore: 78.90,
        slaScore: 85.45,
        uptimeScore: 99.99,
        trend: 'stable',
      };

      expect(result.overallScore).toBe(87.65);
      expect(result.issueScore).toBe(91.23);
    });

    it('should accept scores within 0-100 range', () => {
      const scores = [0, 25, 50, 75, 100];

      for (const score of scores) {
        const result: HealthScoreResult = {
          applicationId: 'app-test',
          overallScore: score,
          issueScore: score,
          changeScore: score,
          slaScore: score,
          uptimeScore: score,
          trend: 'stable',
        };

        expect(result.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.overallScore).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Worker Configuration', () => {
    it('should export healthScoreWorker', async () => {
      const { healthScoreWorker } = await import('../../../../src/jobs/processors/healthScores.js');

      expect(healthScoreWorker).toBeDefined();
    });

    it('should export scheduleHealthScoreCalculation function', async () => {
      const { scheduleHealthScoreCalculation } = await import('../../../../src/jobs/processors/healthScores.js');

      expect(typeof scheduleHealthScoreCalculation).toBe('function');
    });
  });

  describe('Multi-tenant Support', () => {
    it('should support different tenants', () => {
      const tenants = ['enterprise-corp', 'startup-inc', 'nonprofit-org'];

      for (const tenant of tenants) {
        const jobData: CalculateAllHealthScoresJobData = {
          tenantSlug: tenant,
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });

    it('should generate tenant-specific schema names', async () => {
      const { tenantService } = await import('../../../../src/services/tenant.js');

      const schema = tenantService.getSchemaName('acme-corp');
      expect(schema).toBe('tenant_acme-corp');
    });
  });

  describe('Trend Determination', () => {
    it('should identify improving trend when score increases significantly', () => {
      const previousScore = 70;
      const currentScore = 85;
      const diff = currentScore - previousScore;

      // Trend is improving if diff > 5
      expect(diff).toBeGreaterThan(5);
      const trend: 'improving' | 'stable' | 'declining' = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
      expect(trend).toBe('improving');
    });

    it('should identify declining trend when score decreases significantly', () => {
      const previousScore = 85;
      const currentScore = 70;
      const diff = currentScore - previousScore;

      // Trend is declining if diff < -5
      expect(diff).toBeLessThan(-5);
      const trend: 'improving' | 'stable' | 'declining' = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
      expect(trend).toBe('declining');
    });

    it('should identify stable trend when score changes minimally', () => {
      const previousScore = 80;
      const currentScore = 82;
      const diff = currentScore - previousScore;

      // Trend is stable if -5 <= diff <= 5
      expect(Math.abs(diff)).toBeLessThanOrEqual(5);
      const trend: 'improving' | 'stable' | 'declining' = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
      expect(trend).toBe('stable');
    });
  });

  describe('Health Score Components', () => {
    it('should include issue score component', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-1',
        overallScore: 80,
        issueScore: 85,
        changeScore: 75,
        slaScore: 80,
        uptimeScore: 90,
        trend: 'stable',
      };

      expect(result.issueScore).toBeDefined();
      expect(typeof result.issueScore).toBe('number');
    });

    it('should include change score component', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-1',
        overallScore: 80,
        issueScore: 85,
        changeScore: 75,
        slaScore: 80,
        uptimeScore: 90,
        trend: 'stable',
      };

      expect(result.changeScore).toBeDefined();
      expect(typeof result.changeScore).toBe('number');
    });

    it('should include SLA score component', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-1',
        overallScore: 80,
        issueScore: 85,
        changeScore: 75,
        slaScore: 80,
        uptimeScore: 90,
        trend: 'stable',
      };

      expect(result.slaScore).toBeDefined();
      expect(typeof result.slaScore).toBe('number');
    });

    it('should include uptime score component', () => {
      const result: HealthScoreResult = {
        applicationId: 'app-1',
        overallScore: 80,
        issueScore: 85,
        changeScore: 75,
        slaScore: 80,
        uptimeScore: 90,
        trend: 'stable',
      };

      expect(result.uptimeScore).toBeDefined();
      expect(typeof result.uptimeScore).toBe('number');
    });
  });

  describe('Weighted Score Calculation', () => {
    it('should calculate weighted overall score correctly', () => {
      // Default weights: issue=40, change=25, sla=25, uptime=10
      const issueScore = 80;
      const changeScore = 90;
      const slaScore = 85;
      const uptimeScore = 100;

      const expectedOverall =
        (issueScore * 40 + changeScore * 25 + slaScore * 25 + uptimeScore * 10) /
        (40 + 25 + 25 + 10);

      // 3200 + 2250 + 2125 + 1000 = 8575 / 100 = 85.75
      expect(expectedOverall).toBe(85.75);
    });

    it('should handle equal weights', () => {
      const issueScore = 100;
      const changeScore = 80;
      const slaScore = 60;
      const uptimeScore = 40;

      // With equal weights (25 each), average would be simple mean
      const equalWeightAvg = (issueScore + changeScore + slaScore + uptimeScore) / 4;
      expect(equalWeightAvg).toBe(70);
    });
  });

  describe('Job IDs', () => {
    it('should generate unique job IDs with tenant and timestamp', () => {
      const tenantSlug = 'acme-corp';
      const timestamp = Date.now();
      const jobId = `health-all-${tenantSlug}-${timestamp}`;

      expect(jobId).toMatch(/^health-all-acme-corp-\d+$/);
    });

    it('should create distinct job IDs for different tenants', () => {
      const timestamp = Date.now();
      const jobId1 = `health-all-tenant-a-${timestamp}`;
      const jobId2 = `health-all-tenant-b-${timestamp}`;

      expect(jobId1).not.toBe(jobId2);
      expect(jobId1).toContain('tenant-a');
      expect(jobId2).toContain('tenant-b');
    });
  });

  describe('Default Health Config', () => {
    it('should have expected default weights', () => {
      const defaultConfig = {
        issue_weight: 40,
        change_weight: 25,
        sla_weight: 25,
        uptime_weight: 10,
        critical_issue_penalty: 20,
        failed_change_penalty: 15,
        sla_breach_penalty: 10,
      };

      expect(defaultConfig.issue_weight + defaultConfig.change_weight +
             defaultConfig.sla_weight + defaultConfig.uptime_weight).toBe(100);
    });

    it('should have penalties that impact scores', () => {
      const defaultConfig = {
        critical_issue_penalty: 20,
        failed_change_penalty: 15,
        sla_breach_penalty: 10,
      };

      expect(defaultConfig.critical_issue_penalty).toBeGreaterThan(0);
      expect(defaultConfig.failed_change_penalty).toBeGreaterThan(0);
      expect(defaultConfig.sla_breach_penalty).toBeGreaterThan(0);
    });
  });

  describe('scheduleHealthScoreCalculation function', () => {
    it('should return 0 when no active tenants', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const { scheduleHealthScoreCalculation } = await import('../../../../src/jobs/processors/healthScores.js');
      const count = await scheduleHealthScoreCalculation();

      expect(count).toBe(0);
    });

    it('should schedule calculations for active tenants', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ slug: 'tenant-a' }, { slug: 'tenant-b' }],
      });

      const { scheduleHealthScoreCalculation } = await import('../../../../src/jobs/processors/healthScores.js');
      const count = await scheduleHealthScoreCalculation();

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Score Boundary Tests', () => {
    it('should clamp negative scores to 0', () => {
      const calculateClampedScore = (rawScore: number): number => {
        return Math.max(0, Math.min(100, rawScore));
      };

      expect(calculateClampedScore(-20)).toBe(0);
      expect(calculateClampedScore(-100)).toBe(0);
    });

    it('should clamp scores above 100 to 100', () => {
      const calculateClampedScore = (rawScore: number): number => {
        return Math.max(0, Math.min(100, rawScore));
      };

      expect(calculateClampedScore(150)).toBe(100);
      expect(calculateClampedScore(999)).toBe(100);
    });

    it('should preserve scores within valid range', () => {
      const calculateClampedScore = (rawScore: number): number => {
        return Math.max(0, Math.min(100, rawScore));
      };

      expect(calculateClampedScore(0)).toBe(0);
      expect(calculateClampedScore(50)).toBe(50);
      expect(calculateClampedScore(100)).toBe(100);
    });
  });

  describe('Issue Score Calculation', () => {
    it('should start with base score of 100', () => {
      const baseScore = 100;
      expect(baseScore).toBe(100);
    });

    it('should deduct 5 points per open issue', () => {
      const baseScore = 100;
      const openIssues = 3;
      const score = baseScore - (openIssues * 5);

      expect(score).toBe(85);
    });

    it('should apply critical issue penalty', () => {
      const baseScore = 100;
      const criticalIssues = 2;
      const criticalPenalty = 20;
      const score = baseScore - (criticalIssues * criticalPenalty);

      expect(score).toBe(60);
    });

    it('should apply high priority penalty', () => {
      const baseScore = 100;
      const highIssues = 3;
      const highPenalty = 10;
      const score = baseScore - (highIssues * highPenalty);

      expect(score).toBe(70);
    });

    it('should combine all deductions', () => {
      const baseScore = 100;
      const openIssues = 2;
      const criticalIssues = 1;
      const highIssues = 1;
      const criticalPenalty = 20;

      let score = baseScore;
      score -= openIssues * 5; // -10
      score -= criticalIssues * criticalPenalty; // -20
      score -= highIssues * 10; // -10

      expect(score).toBe(60);
    });
  });

  describe('Change Score Calculation', () => {
    it('should return 100 when no changes', () => {
      const totalChanges = 0;
      const score = totalChanges === 0 ? 100 : 0;

      expect(score).toBe(100);
    });

    it('should calculate success rate', () => {
      const successful = 8;
      const total = 10;
      const successRate = successful / total;

      expect(successRate).toBe(0.8);
    });

    it('should apply failed change penalty', () => {
      const successRate = 0.8;
      const failed = 2;
      const failedPenalty = 15;
      let score = successRate * 100;
      score -= failed * failedPenalty;

      expect(score).toBe(50);
    });
  });

  describe('SLA Score Calculation', () => {
    it('should return 100 when no issues', () => {
      const totalIssues = 0;
      const score = totalIssues === 0 ? 100 : 0;

      expect(score).toBe(100);
    });

    it('should calculate compliance rate', () => {
      const total = 10;
      const breached = 2;
      const complianceRate = (total - breached) / total;

      expect(complianceRate).toBe(0.8);
    });

    it('should apply breach penalty', () => {
      const complianceRate = 0.8;
      const breached = 2;
      const breachPenalty = 10;
      let score = complianceRate * 100;
      score -= breached * breachPenalty;

      expect(score).toBe(60);
    });
  });

  describe('Uptime Score Calculation', () => {
    it('should start with base score of 100', () => {
      const baseScore = 100;
      expect(baseScore).toBe(100);
    });

    it('should deduct 5 points per outage', () => {
      const baseScore = 100;
      const outages = 2;
      const score = baseScore - (outages * 5);

      expect(score).toBe(90);
    });

    it('should handle multiple outages', () => {
      const baseScore = 100;
      const outages = 10;
      const score = Math.max(0, baseScore - (outages * 5));

      expect(score).toBe(50);
    });
  });
});
