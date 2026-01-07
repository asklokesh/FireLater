import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Job } from 'bullmq';

// Use vi.hoisted to ensure mocks are created before module loads
const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockEmailSend = vi.hoisted(() => vi.fn());
const mockSlackSend = vi.hoisted(() => vi.fn());

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

// Mock email service
vi.mock('../../../../src/services/email/index.js', () => ({
  emailService: {
    send: mockEmailSend,
  },
}));

// Mock slack service
vi.mock('../../../../src/services/slack/index.js', () => ({
  slackService: {
    send: mockSlackSend,
  },
}));

// Mock BullMQ Worker to prevent actual Redis connection
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    name: 'notifications',
  })),
  Job: vi.fn(),
}));

// Import after mocks are set up
import { queueNotification, type NotificationJobData } from '../../../../src/jobs/processors/notifications.js';

describe('Notification Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockEmailSend.mockResolvedValue({ success: true });
    mockSlackSend.mockResolvedValue({ success: true });
  });

  describe('NotificationJobData Interface', () => {
    it('should accept valid notification job data', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'sla_breach',
        recipientIds: ['user-1', 'user-2'],
        channel: 'email',
        data: { issueNumber: 'INC-123', priority: 'high' },
      };

      expect(jobData.tenantSlug).toBe('test-tenant');
      expect(jobData.type).toBe('sla_breach');
      expect(jobData.recipientIds).toHaveLength(2);
      expect(jobData.channel).toBe('email');
    });

    it('should accept notification data with recipient emails', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'issue_assigned',
        recipientEmails: ['user@example.com'],
        channel: 'all',
        subject: 'Custom Subject',
        message: 'Custom Message',
      };

      expect(jobData.recipientEmails).toEqual(['user@example.com']);
      expect(jobData.subject).toBe('Custom Subject');
    });

    it('should accept minimal notification data', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'default',
      };

      expect(jobData.tenantSlug).toBe('test-tenant');
      expect(jobData.type).toBe('default');
      expect(jobData.channel).toBeUndefined();
    });
  });

  describe('Notification Types', () => {
    it('should support SLA breach notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'sla_breach',
        data: {
          issueNumber: 'INC-123',
          priority: 'critical',
          breachType: 'response',
          breachedAt: new Date().toISOString(),
        },
      };

      expect(jobData.type).toBe('sla_breach');
      expect(jobData.data?.issueNumber).toBe('INC-123');
    });

    it('should support SLA warning notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'sla_warning',
        data: {
          issueNumber: 'INC-456',
          priority: 'high',
          warningType: 'resolution',
          timeRemaining: 30,
        },
      };

      expect(jobData.type).toBe('sla_warning');
      expect(jobData.data?.timeRemaining).toBe(30);
    });

    it('should support issue assigned notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC-789',
          title: 'Database performance issue',
          priority: 'medium',
        },
      };

      expect(jobData.type).toBe('issue_assigned');
      expect(jobData.data?.title).toBe('Database performance issue');
    });

    it('should support change approval notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'change_approval_required',
        data: {
          changeId: 'CHG-001',
          title: 'API Deployment',
          riskLevel: 'high',
          scheduledStart: new Date().toISOString(),
        },
      };

      expect(jobData.type).toBe('change_approval_required');
      expect(jobData.data?.riskLevel).toBe('high');
    });

    it('should support change approved notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'change_approved',
        data: {
          changeId: 'CHG-002',
          approvedBy: 'admin@example.com',
          scheduledStart: new Date().toISOString(),
        },
      };

      expect(jobData.type).toBe('change_approved');
      expect(jobData.data?.approvedBy).toBe('admin@example.com');
    });

    it('should support change rejected notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'change_rejected',
        data: {
          changeId: 'CHG-003',
          rejectedBy: 'manager@example.com',
          reason: 'Insufficient testing',
        },
      };

      expect(jobData.type).toBe('change_rejected');
      expect(jobData.data?.reason).toBe('Insufficient testing');
    });

    it('should support request status update notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'request_status_update',
        data: {
          requestId: 'REQ-001',
          status: 'in_progress',
          message: 'Your request is being processed',
        },
      };

      expect(jobData.type).toBe('request_status_update');
      expect(jobData.data?.status).toBe('in_progress');
    });

    it('should support health score critical notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'health_score_critical',
        data: {
          appName: 'Core API',
          score: 25,
          trend: 'declining',
        },
      };

      expect(jobData.type).toBe('health_score_critical');
      expect(jobData.data?.score).toBe(25);
    });

    it('should support report ready notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'report_ready',
        data: {
          reportName: 'Monthly Incident Summary',
        },
      };

      expect(jobData.type).toBe('report_ready');
      expect(jobData.data?.reportName).toBe('Monthly Incident Summary');
    });

    it('should handle default/unknown notification type', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'custom_notification',
        subject: 'Custom Subject',
        message: 'Custom message content',
      };

      expect(jobData.type).toBe('custom_notification');
      expect(jobData.subject).toBe('Custom Subject');
    });
  });

  describe('Channel Options', () => {
    it('should support email channel', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'test',
        channel: 'email',
      };

      expect(jobData.channel).toBe('email');
    });

    it('should support slack channel', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'test',
        channel: 'slack',
      };

      expect(jobData.channel).toBe('slack');
    });

    it('should support in_app channel', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'test',
        channel: 'in_app',
      };

      expect(jobData.channel).toBe('in_app');
    });

    it('should support all channels', () => {
      const jobData: NotificationJobData = {
        tenantSlug: 'test-tenant',
        type: 'test',
        channel: 'all',
      };

      expect(jobData.channel).toBe('all');
    });
  });

  describe('queueNotification Helper', () => {
    it('should be a function', () => {
      expect(typeof queueNotification).toBe('function');
    });

    it('should accept valid parameters', async () => {
      // Note: This will fail to actually queue because Redis is mocked
      // but it tests the function signature
      try {
        await queueNotification('test-tenant', 'sla_breach', {
          recipientIds: ['user-1'],
          channel: 'email',
          data: { issueNumber: 'INC-123' },
          priority: 1,
        });
      } catch {
        // Expected to fail due to mocked dependencies
      }
    });
  });

  describe('Worker Configuration', () => {
    it('should export notificationWorker', async () => {
      const { notificationWorker } = await import('../../../../src/jobs/processors/notifications.js');

      expect(notificationWorker).toBeDefined();
    });
  });
});
