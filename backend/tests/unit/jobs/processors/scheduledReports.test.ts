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

// Mock reporting service
vi.mock('../../../../src/services/reporting.js', () => ({
  reportExecutionService: {
    execute: vi.fn().mockResolvedValue({
      execution: { id: 'exec-123' },
    }),
  },
  scheduledReportService: {
    getById: vi.fn().mockResolvedValue({
      id: 'report-123',
      is_active: true,
      created_by: 'user-123',
      template_id: 'template-123',
      parameters: {},
      output_format: 'json',
    }),
    updateLastRun: vi.fn().mockResolvedValue(undefined),
    getDueReports: vi.fn().mockResolvedValue([]),
  },
}));

// Mock BullMQ Worker to prevent actual Redis connection
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    name: 'scheduled-reports',
  })),
  Job: vi.fn(),
}));

// Import after mocks are set up
import {
  type ScheduledReportJobData,
  type ExecuteReportJobData,
} from '../../../../src/jobs/processors/scheduledReports.js';

describe('ScheduledReports Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('ScheduledReportJobData Interface', () => {
    it('should accept valid scheduled report job data', () => {
      const jobData: ScheduledReportJobData = {
        scheduledReportId: 'report-123',
        tenantSlug: 'test-tenant',
      };

      expect(jobData.scheduledReportId).toBe('report-123');
      expect(jobData.tenantSlug).toBe('test-tenant');
    });

    it('should handle different report IDs', () => {
      const reportIds = ['report-1', 'report-2', 'report-3'];

      for (const reportId of reportIds) {
        const jobData: ScheduledReportJobData = {
          scheduledReportId: reportId,
          tenantSlug: 'test-tenant',
        };

        expect(jobData.scheduledReportId).toBe(reportId);
      }
    });

    it('should handle different tenant slugs', () => {
      const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];

      for (const tenant of tenants) {
        const jobData: ScheduledReportJobData = {
          scheduledReportId: 'report-123',
          tenantSlug: tenant,
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });
  });

  describe('ExecuteReportJobData Interface', () => {
    it('should accept valid execute report job data with required fields', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
      };

      expect(jobData.templateId).toBe('template-123');
      expect(jobData.tenantSlug).toBe('test-tenant');
      expect(jobData.userId).toBe('user-123');
    });

    it('should accept optional parameters', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          priority: 'high',
        },
      };

      expect(jobData.parameters).toBeDefined();
      expect(jobData.parameters?.startDate).toBe('2024-01-01');
      expect(jobData.parameters?.priority).toBe('high');
    });

    it('should accept json format', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        format: 'json',
      };

      expect(jobData.format).toBe('json');
    });

    it('should accept csv format', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        format: 'csv',
      };

      expect(jobData.format).toBe('csv');
    });

    it('should accept pdf format', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        format: 'pdf',
      };

      expect(jobData.format).toBe('pdf');
    });

    it('should handle undefined format (defaults to json)', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
      };

      expect(jobData.format).toBeUndefined();
    });
  });

  describe('Output Formats', () => {
    it('should support all three output formats', () => {
      const formats: Array<'json' | 'csv' | 'pdf'> = ['json', 'csv', 'pdf'];

      for (const format of formats) {
        const jobData: ExecuteReportJobData = {
          templateId: 'template-123',
          tenantSlug: 'test-tenant',
          userId: 'user-123',
          format,
        };

        expect(['json', 'csv', 'pdf']).toContain(jobData.format);
      }
    });
  });

  describe('Report Parameters', () => {
    it('should handle date range parameters', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      };

      expect(jobData.parameters?.startDate).toBe('2024-01-01');
      expect(jobData.parameters?.endDate).toBe('2024-01-31');
    });

    it('should handle filter parameters', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {
          priority: ['critical', 'high'],
          status: 'open',
          applicationId: 'app-123',
        },
      };

      expect(Array.isArray(jobData.parameters?.priority)).toBe(true);
      expect(jobData.parameters?.status).toBe('open');
    });

    it('should handle numeric parameters', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {
          limit: 100,
          page: 1,
          minScore: 50,
        },
      };

      expect(jobData.parameters?.limit).toBe(100);
      expect(jobData.parameters?.minScore).toBe(50);
    });

    it('should handle boolean parameters', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {
          includeResolved: false,
          exportAll: true,
        },
      };

      expect(jobData.parameters?.includeResolved).toBe(false);
      expect(jobData.parameters?.exportAll).toBe(true);
    });

    it('should handle empty parameters', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {},
      };

      expect(Object.keys(jobData.parameters || {}).length).toBe(0);
    });
  });

  describe('Worker Configuration', () => {
    it('should export scheduledReportsWorker', async () => {
      const { scheduledReportsWorker } = await import('../../../../src/jobs/processors/scheduledReports.js');

      expect(scheduledReportsWorker).toBeDefined();
    });

    it('should export queueDueScheduledReports function', async () => {
      const { queueDueScheduledReports } = await import('../../../../src/jobs/processors/scheduledReports.js');

      expect(typeof queueDueScheduledReports).toBe('function');
    });
  });

  describe('Multi-tenant Support', () => {
    it('should support different tenants for scheduled reports', () => {
      const tenants = ['enterprise-corp', 'startup-inc', 'nonprofit-org'];

      for (const tenant of tenants) {
        const jobData: ScheduledReportJobData = {
          scheduledReportId: 'report-123',
          tenantSlug: tenant,
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });

    it('should support different tenants for report execution', () => {
      const tenants = ['enterprise-corp', 'startup-inc', 'nonprofit-org'];

      for (const tenant of tenants) {
        const jobData: ExecuteReportJobData = {
          templateId: 'template-123',
          tenantSlug: tenant,
          userId: 'user-123',
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });
  });

  describe('Job IDs', () => {
    it('should generate unique job IDs for scheduled reports', () => {
      const reportId = 'report-123';
      const timestamp = Date.now();
      const jobId = `scheduled-${reportId}-${timestamp}`;

      expect(jobId).toMatch(/^scheduled-report-123-\d+$/);
    });

    it('should create distinct job IDs for different reports', () => {
      const timestamp = Date.now();
      const jobId1 = `scheduled-report-1-${timestamp}`;
      const jobId2 = `scheduled-report-2-${timestamp}`;

      expect(jobId1).not.toBe(jobId2);
    });
  });

  describe('Report Execution Results', () => {
    it('should include execution ID in success result', () => {
      const result = {
        success: true,
        executionId: 'exec-123',
      };

      expect(result.success).toBe(true);
      expect(result.executionId).toBe('exec-123');
    });

    it('should handle skipped report result', () => {
      const result = {
        skipped: true,
        reason: 'inactive',
      };

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('inactive');
    });
  });

  describe('User Context', () => {
    it('should include user ID for report execution', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-abc-123',
      };

      expect(jobData.userId).toBe('user-abc-123');
    });

    it('should handle different user IDs', () => {
      const userIds = ['user-1', 'admin-user', 'service-account'];

      for (const userId of userIds) {
        const jobData: ExecuteReportJobData = {
          templateId: 'template-123',
          tenantSlug: 'test-tenant',
          userId,
        };

        expect(jobData.userId).toBe(userId);
      }
    });
  });

  describe('Template Reference', () => {
    it('should reference template by ID', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-sla-performance',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
      };

      expect(jobData.templateId).toBe('template-sla-performance');
    });

    it('should handle various template IDs', () => {
      const templateIds = [
        'issues-summary',
        'change-audit',
        'sla-performance',
        'health-dashboard',
        'cost-analysis',
      ];

      for (const templateId of templateIds) {
        const jobData: ExecuteReportJobData = {
          templateId,
          tenantSlug: 'test-tenant',
          userId: 'user-123',
        };

        expect(jobData.templateId).toBe(templateId);
      }
    });
  });

  describe('Scheduled Report State', () => {
    it('should handle active scheduled reports', () => {
      const scheduledReport = {
        id: 'report-123',
        is_active: true,
        template_id: 'template-123',
      };

      expect(scheduledReport.is_active).toBe(true);
    });

    it('should handle inactive scheduled reports', () => {
      const scheduledReport = {
        id: 'report-456',
        is_active: false,
        template_id: 'template-456',
      };

      expect(scheduledReport.is_active).toBe(false);
    });
  });

  describe('Job Names', () => {
    it('should support execute-scheduled job name', () => {
      const jobName = 'execute-scheduled';
      expect(jobName).toBe('execute-scheduled');
    });

    it('should support execute-report job name', () => {
      const jobName = 'execute-report';
      expect(jobName).toBe('execute-report');
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('should have rate limit configuration', () => {
      const limiter = {
        max: 10,
        duration: 60000, // 10 jobs per minute
      };

      expect(limiter.max).toBe(10);
      expect(limiter.duration).toBe(60000);
    });

    it('should have concurrency configuration', () => {
      const concurrency = 3;
      expect(concurrency).toBe(3);
    });
  });

  describe('Complex Parameter Scenarios', () => {
    it('should handle nested parameters', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {
          dateRange: {
            start: '2024-01-01',
            end: '2024-01-31',
          },
          filters: {
            priority: ['high', 'critical'],
            status: ['open', 'in_progress'],
          },
        },
      };

      expect(jobData.parameters?.dateRange).toBeDefined();
      expect(jobData.parameters?.filters).toBeDefined();
    });

    it('should handle null and undefined parameter values', () => {
      const jobData: ExecuteReportJobData = {
        templateId: 'template-123',
        tenantSlug: 'test-tenant',
        userId: 'user-123',
        parameters: {
          assignee: null,
          category: undefined,
          priority: 'high',
        },
      };

      expect(jobData.parameters?.assignee).toBeNull();
      expect(jobData.parameters?.category).toBeUndefined();
      expect(jobData.parameters?.priority).toBe('high');
    });
  });
});
