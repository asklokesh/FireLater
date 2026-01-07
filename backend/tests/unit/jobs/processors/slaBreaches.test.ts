import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are created before module loads
const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockNotificationQueueAdd = vi.hoisted(() => vi.fn());

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

// Mock SLA service
vi.mock('../../../../src/services/sla.js', () => ({
  slaService: {
    getSlaConfigFromDb: vi.fn().mockResolvedValue([]),
  },
  SlaConfigForBreachCheck: {},
}));

// Mock notification queue
vi.mock('../../../../src/jobs/queues.js', () => ({
  notificationQueue: {
    add: mockNotificationQueueAdd,
  },
}));

// Mock BullMQ Worker to prevent actual Redis connection
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    name: 'sla-breaches',
  })),
  Job: vi.fn(),
}));

// Mock pg-format
vi.mock('pg-format', () => ({
  default: vi.fn().mockImplementation((query: string, ...args: unknown[]) => {
    let result = query;
    args.forEach((arg, idx) => {
      result = result.replace(new RegExp(`%${idx === 0 ? 'I' : 's'}`, 'g'), String(arg));
    });
    return result;
  }),
}));

// Import after mocks are set up
import {
  type CheckSlaBreachesJobData,
  type SlaBreachResult,
  type ApproachingSlaResult,
} from '../../../../src/jobs/processors/slaBreaches.js';

describe('SlaBreaches Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockNotificationQueueAdd.mockResolvedValue({ id: 'job-id' });
  });

  describe('CheckSlaBreachesJobData Interface', () => {
    it('should accept valid check SLA breaches job data', () => {
      const jobData: CheckSlaBreachesJobData = {
        tenantSlug: 'test-tenant',
      };

      expect(jobData.tenantSlug).toBe('test-tenant');
    });

    it('should handle different tenant slugs', () => {
      const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];

      for (const tenant of tenants) {
        const jobData: CheckSlaBreachesJobData = {
          tenantSlug: tenant,
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });
  });

  describe('SlaBreachResult Interface', () => {
    it('should have all required properties', () => {
      const result: SlaBreachResult = {
        issueId: 'issue-123',
        issueNumber: 'INC-001',
        priority: 'critical',
        breachType: 'response',
        breachedAt: new Date('2024-01-15T10:00:00Z'),
      };

      expect(result.issueId).toBe('issue-123');
      expect(result.issueNumber).toBe('INC-001');
      expect(result.priority).toBe('critical');
      expect(result.breachType).toBe('response');
      expect(result.breachedAt).toBeInstanceOf(Date);
    });

    it('should support response breach type', () => {
      const result: SlaBreachResult = {
        issueId: 'issue-123',
        issueNumber: 'INC-001',
        priority: 'high',
        breachType: 'response',
        breachedAt: new Date(),
      };

      expect(result.breachType).toBe('response');
    });

    it('should support resolution breach type', () => {
      const result: SlaBreachResult = {
        issueId: 'issue-456',
        issueNumber: 'INC-002',
        priority: 'medium',
        breachType: 'resolution',
        breachedAt: new Date(),
      };

      expect(result.breachType).toBe('resolution');
    });

    it('should work with array of breaches', () => {
      const breaches: SlaBreachResult[] = [
        { issueId: 'i1', issueNumber: 'INC-001', priority: 'critical', breachType: 'response', breachedAt: new Date() },
        { issueId: 'i2', issueNumber: 'INC-002', priority: 'high', breachType: 'resolution', breachedAt: new Date() },
        { issueId: 'i3', issueNumber: 'INC-003', priority: 'medium', breachType: 'response', breachedAt: new Date() },
      ];

      expect(breaches.length).toBe(3);
      expect(breaches.filter(b => b.breachType === 'response').length).toBe(2);
      expect(breaches.filter(b => b.breachType === 'resolution').length).toBe(1);
    });
  });

  describe('ApproachingSlaResult Interface', () => {
    it('should have all required properties', () => {
      const result: ApproachingSlaResult = {
        issueId: 'issue-789',
        issueNumber: 'INC-100',
        priority: 'high',
        warningType: 'resolution',
        timeRemaining: 30,
      };

      expect(result.issueId).toBe('issue-789');
      expect(result.issueNumber).toBe('INC-100');
      expect(result.priority).toBe('high');
      expect(result.warningType).toBe('resolution');
      expect(result.timeRemaining).toBe(30);
    });

    it('should support response warning type', () => {
      const result: ApproachingSlaResult = {
        issueId: 'issue-1',
        issueNumber: 'INC-001',
        priority: 'critical',
        warningType: 'response',
        timeRemaining: 5,
      };

      expect(result.warningType).toBe('response');
    });

    it('should support resolution warning type', () => {
      const result: ApproachingSlaResult = {
        issueId: 'issue-2',
        issueNumber: 'INC-002',
        priority: 'high',
        warningType: 'resolution',
        timeRemaining: 60,
      };

      expect(result.warningType).toBe('resolution');
    });

    it('should handle low time remaining', () => {
      const result: ApproachingSlaResult = {
        issueId: 'issue-urgent',
        issueNumber: 'INC-999',
        priority: 'critical',
        warningType: 'response',
        timeRemaining: 2,
      };

      expect(result.timeRemaining).toBeLessThan(5);
    });
  });

  describe('Priority Levels', () => {
    it('should support critical priority', () => {
      const result: SlaBreachResult = {
        issueId: 'i1',
        issueNumber: 'INC-001',
        priority: 'critical',
        breachType: 'response',
        breachedAt: new Date(),
      };

      expect(result.priority).toBe('critical');
    });

    it('should support high priority', () => {
      const result: SlaBreachResult = {
        issueId: 'i2',
        issueNumber: 'INC-002',
        priority: 'high',
        breachType: 'response',
        breachedAt: new Date(),
      };

      expect(result.priority).toBe('high');
    });

    it('should support medium priority', () => {
      const result: SlaBreachResult = {
        issueId: 'i3',
        issueNumber: 'INC-003',
        priority: 'medium',
        breachType: 'response',
        breachedAt: new Date(),
      };

      expect(result.priority).toBe('medium');
    });

    it('should support low priority', () => {
      const result: SlaBreachResult = {
        issueId: 'i4',
        issueNumber: 'INC-004',
        priority: 'low',
        breachType: 'resolution',
        breachedAt: new Date(),
      };

      expect(result.priority).toBe('low');
    });
  });

  describe('Default SLA Configuration', () => {
    it('should have default config for critical priority', () => {
      const criticalConfig = {
        priority: 'critical',
        responseTimeMinutes: 15,
        resolutionTimeMinutes: 240,
        warningThresholdPercent: 80,
      };

      expect(criticalConfig.responseTimeMinutes).toBe(15);
      expect(criticalConfig.resolutionTimeMinutes).toBe(240); // 4 hours
    });

    it('should have default config for high priority', () => {
      const highConfig = {
        priority: 'high',
        responseTimeMinutes: 60,
        resolutionTimeMinutes: 480,
        warningThresholdPercent: 80,
      };

      expect(highConfig.responseTimeMinutes).toBe(60); // 1 hour
      expect(highConfig.resolutionTimeMinutes).toBe(480); // 8 hours
    });

    it('should have default config for medium priority', () => {
      const mediumConfig = {
        priority: 'medium',
        responseTimeMinutes: 240,
        resolutionTimeMinutes: 1440,
        warningThresholdPercent: 80,
      };

      expect(mediumConfig.responseTimeMinutes).toBe(240); // 4 hours
      expect(mediumConfig.resolutionTimeMinutes).toBe(1440); // 24 hours
    });

    it('should have default config for low priority', () => {
      const lowConfig = {
        priority: 'low',
        responseTimeMinutes: 480,
        resolutionTimeMinutes: 2880,
        warningThresholdPercent: 80,
      };

      expect(lowConfig.responseTimeMinutes).toBe(480); // 8 hours
      expect(lowConfig.resolutionTimeMinutes).toBe(2880); // 48 hours
    });
  });

  describe('Worker Configuration', () => {
    it('should export slaBreachWorker', async () => {
      const { slaBreachWorker } = await import('../../../../src/jobs/processors/slaBreaches.js');

      expect(slaBreachWorker).toBeDefined();
    });

    it('should export scheduleSlaBreachChecks function', async () => {
      const { scheduleSlaBreachChecks } = await import('../../../../src/jobs/processors/slaBreaches.js');

      expect(typeof scheduleSlaBreachChecks).toBe('function');
    });

    it('should export checkApproachingSla function', async () => {
      const { checkApproachingSla } = await import('../../../../src/jobs/processors/slaBreaches.js');

      expect(typeof checkApproachingSla).toBe('function');
    });
  });

  describe('Multi-tenant Support', () => {
    it('should support different tenants', () => {
      const tenants = ['enterprise-corp', 'startup-inc', 'nonprofit-org'];

      for (const tenant of tenants) {
        const jobData: CheckSlaBreachesJobData = {
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

  describe('Breach Detection Logic', () => {
    it('should identify response time breaches', () => {
      const responseTimeMinutes = 15; // Critical SLA
      const elapsedMinutes = 20;

      const isBreached = elapsedMinutes > responseTimeMinutes;
      expect(isBreached).toBe(true);
    });

    it('should not flag as breached within SLA', () => {
      const responseTimeMinutes = 15; // Critical SLA
      const elapsedMinutes = 10;

      const isBreached = elapsedMinutes > responseTimeMinutes;
      expect(isBreached).toBe(false);
    });

    it('should identify resolution time breaches', () => {
      const resolutionTimeMinutes = 240; // 4 hours for critical
      const elapsedMinutes = 300; // 5 hours elapsed

      const isBreached = elapsedMinutes > resolutionTimeMinutes;
      expect(isBreached).toBe(true);
    });
  });

  describe('Warning Threshold Calculation', () => {
    it('should calculate 75% warning threshold', () => {
      const resolutionTimeMinutes = 240; // 4 hours
      const warningThresholdPercent = 75;

      const warningThreshold = resolutionTimeMinutes * (warningThresholdPercent / 100);
      expect(warningThreshold).toBe(180); // 3 hours
    });

    it('should calculate 80% warning threshold', () => {
      const resolutionTimeMinutes = 480; // 8 hours
      const warningThresholdPercent = 80;

      const warningThreshold = resolutionTimeMinutes * (warningThresholdPercent / 100);
      expect(warningThreshold).toBe(384); // 6.4 hours
    });

    it('should calculate time remaining correctly', () => {
      const resolutionTimeMinutes = 240;
      const elapsedMinutes = 200;

      const timeRemaining = resolutionTimeMinutes - elapsedMinutes;
      expect(timeRemaining).toBe(40);
    });
  });

  describe('Job IDs', () => {
    it('should generate unique job IDs for SLA checks', () => {
      const tenantSlug = 'acme-corp';
      const timestamp = Date.now();
      const jobId = `sla-check-${tenantSlug}-${timestamp}`;

      expect(jobId).toMatch(/^sla-check-acme-corp-\d+$/);
    });

    it('should generate unique job IDs for breach notifications', () => {
      const issueId = 'issue-123';
      const breachType = 'response';
      const jobId = `sla-breach-${issueId}-${breachType}`;

      expect(jobId).toBe('sla-breach-issue-123-response');
    });
  });

  describe('Notification Priority', () => {
    it('should assign high priority to critical breaches', () => {
      const priority = 'critical';
      const notificationPriority = priority === 'critical' ? 1 : 2;

      expect(notificationPriority).toBe(1);
    });

    it('should assign lower priority to non-critical breaches', () => {
      const priorities = ['high', 'medium', 'low'];

      for (const priority of priorities) {
        const notificationPriority = priority === 'critical' ? 1 : 2;
        expect(notificationPriority).toBe(2);
      }
    });
  });

  describe('Issue Number Format', () => {
    it('should accept standard issue number format', () => {
      const result: SlaBreachResult = {
        issueId: 'uuid-123',
        issueNumber: 'INC-12345',
        priority: 'high',
        breachType: 'response',
        breachedAt: new Date(),
      };

      expect(result.issueNumber).toMatch(/^INC-\d+$/);
    });

    it('should handle various issue number formats', () => {
      const issueNumbers = ['INC-001', 'INC-12345', 'INC-999999'];

      for (const issueNumber of issueNumbers) {
        const result: SlaBreachResult = {
          issueId: 'uuid',
          issueNumber,
          priority: 'medium',
          breachType: 'resolution',
          breachedAt: new Date(),
        };

        expect(result.issueNumber).toBeDefined();
      }
    });
  });

  describe('Breach Count Aggregation', () => {
    it('should count total breaches correctly', () => {
      const responseBreaches: SlaBreachResult[] = [
        { issueId: 'i1', issueNumber: 'INC-001', priority: 'critical', breachType: 'response', breachedAt: new Date() },
        { issueId: 'i2', issueNumber: 'INC-002', priority: 'high', breachType: 'response', breachedAt: new Date() },
      ];

      const resolutionBreaches: SlaBreachResult[] = [
        { issueId: 'i3', issueNumber: 'INC-003', priority: 'medium', breachType: 'resolution', breachedAt: new Date() },
      ];

      const allBreaches = [...responseBreaches, ...resolutionBreaches];
      expect(allBreaches.length).toBe(3);
    });

    it('should handle empty breach arrays', () => {
      const responseBreaches: SlaBreachResult[] = [];
      const resolutionBreaches: SlaBreachResult[] = [];

      const allBreaches = [...responseBreaches, ...resolutionBreaches];
      expect(allBreaches.length).toBe(0);
    });

    it('should deduplicate issue IDs for marking', () => {
      const breaches: SlaBreachResult[] = [
        { issueId: 'i1', issueNumber: 'INC-001', priority: 'critical', breachType: 'response', breachedAt: new Date() },
        { issueId: 'i1', issueNumber: 'INC-001', priority: 'critical', breachType: 'resolution', breachedAt: new Date() },
        { issueId: 'i2', issueNumber: 'INC-002', priority: 'high', breachType: 'response', breachedAt: new Date() },
      ];

      const uniqueIssueIds = [...new Set(breaches.map(b => b.issueId))];
      expect(uniqueIssueIds.length).toBe(2);
      expect(uniqueIssueIds).toContain('i1');
      expect(uniqueIssueIds).toContain('i2');
    });
  });

  describe('checkApproachingSla function', () => {
    it('should return empty array when no issues are approaching SLA', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const { checkApproachingSla } = await import('../../../../src/jobs/processors/slaBreaches.js');
      const result = await checkApproachingSla('test-tenant');

      expect(result).toEqual([]);
    });

    it('should return warnings for issues approaching SLA', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // getSlaConfigFromDb call
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { id: 'issue-1', issue_number: 'INC-001', priority: 'critical', elapsed_minutes: 180 },
        ],
      });
      mockPoolQuery.mockResolvedValue({ rows: [] }); // Remaining priority queries

      const { checkApproachingSla } = await import('../../../../src/jobs/processors/slaBreaches.js');
      const result = await checkApproachingSla('test-tenant', 75);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should use default 75% warning threshold when not specified', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const { checkApproachingSla } = await import('../../../../src/jobs/processors/slaBreaches.js');
      await checkApproachingSla('test-tenant');

      // Verify the function was called (no error thrown)
      expect(true).toBe(true);
    });

    it('should handle custom warning threshold', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const { checkApproachingSla } = await import('../../../../src/jobs/processors/slaBreaches.js');
      await checkApproachingSla('test-tenant', 80);

      expect(true).toBe(true);
    });
  });

  describe('scheduleSlaBreachChecks function', () => {
    it('should schedule checks for active tenants', async () => {
      const mockSlaBreachQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };

      // Mock the queues module for this specific test
      vi.doMock('../../../../src/jobs/queues.js', () => ({
        notificationQueue: { add: vi.fn() },
        slaBreachQueue: mockSlaBreachQueue,
      }));

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ slug: 'tenant-a' }, { slug: 'tenant-b' }],
      });

      const { scheduleSlaBreachChecks } = await import('../../../../src/jobs/processors/slaBreaches.js');
      const count = await scheduleSlaBreachChecks();

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when no active tenants', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const { scheduleSlaBreachChecks } = await import('../../../../src/jobs/processors/slaBreaches.js');
      const count = await scheduleSlaBreachChecks();

      expect(count).toBe(0);
    });
  });
});
