import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/config/index.js', () => ({
  config: {
    isDev: true,
    slack: {
      defaultWebhookUrl: undefined,
    },
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn(),
  },
}));

describe('SlackService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('buildSlackMessage', () => {
    it('should build SLA breach message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'sla_breach',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15 10:30:00',
          issueId: 'issue-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build issue assigned message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC002',
          title: 'Server Down',
          priority: 'critical',
          issueId: 'issue-2',
          slackUserId: 'U12345',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build change approval required message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'change_approval_required',
        data: {
          changeId: 'CHG001',
          title: 'Database Migration',
          riskLevel: 'high',
          submittedBy: 'John Doe',
          scheduledFor: '2024-01-20 02:00:00',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build request approved message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'request_approved',
        data: {
          requestNumber: 'REQ001',
          title: 'New Laptop',
          approvedBy: 'Jane Manager',
          requestId: 'req-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build application health alert message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'application_health_alert',
        data: {
          applicationName: 'CRM System',
          healthScore: 45,
          previousScore: 85,
          applicationId: 'app-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build report ready message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'report_ready',
        data: {
          reportName: 'Monthly SLA Report',
          reportId: 'report-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build oncall shift reminder message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'oncall_shift_reminder',
        data: {
          scheduleName: 'IT Support On-Call',
          timeUntil: '30 minutes',
          shiftStart: '2024-01-15 18:00:00',
          shiftEnd: '2024-01-16 06:00:00',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build shift swap request message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'shift_swap_request',
        data: {
          requesterName: 'John Doe',
          scheduleName: 'Weekend On-Call',
          originalStart: '2024-01-20 08:00:00',
          originalEnd: '2024-01-21 08:00:00',
          reason: 'Personal appointment',
          swapId: 'swap-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build shift swap accepted message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'shift_swap_accepted',
        data: {
          scheduleName: 'Weekend On-Call',
          accepterName: 'Jane Doe',
          originalStart: '2024-01-20 08:00:00',
          originalEnd: '2024-01-21 08:00:00',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build CAB meeting reminder message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'cab_meeting_reminder',
        data: {
          meetingTitle: 'Weekly CAB Meeting',
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          location: 'Conference Room A',
          meetingId: 'meeting-1',
          meetingLink: 'https://zoom.us/j/123',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build problem RCA completed message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'problem_rca_completed',
        data: {
          problemNumber: 'PRB001',
          title: 'Recurring Server Crashes',
          rootCause: 'Memory leak in application',
          analyzedBy: 'John Engineer',
          problemId: 'problem-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build issue escalated message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'issue_escalated',
        data: {
          issueNumber: 'INC003',
          title: 'Critical System Failure',
          priority: 'critical',
          escalationLevel: 'Level 2',
          reason: 'SLA breach imminent',
          issueId: 'issue-3',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build daily summary message', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'daily_summary',
        data: {
          date: '2024-01-15',
          openIssues: 42,
          resolvedToday: 15,
          pendingChanges: 8,
          slaBreaches: 2,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should use default template for unknown types', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'unknown_type',
        data: {
          message: 'Custom notification message',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should use default message when no message provided', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        type: 'default',
        data: {},
      });

      expect(result.success).toBe(true);
    });
  });

  describe('send', () => {
    it('should return success when webhook not configured', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');
      const { logger } = await import('../../../src/utils/logger.js');

      const result = await slackService.send({
        type: 'sla_breach',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15',
          issueId: 'issue-1',
        },
      });

      expect(result.success).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'sla_breach' }),
        'Slack message would be sent (webhook not configured)'
      );
    });

    it('should send message when webhook is provided', async () => {
      // Mock fetch globally
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test Issue',
          priority: 'medium',
          issueId: 'issue-1',
        },
      });

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      vi.unstubAllGlobals();
    });

    it('should handle API errors', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('invalid_payload'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Slack API error');

      vi.unstubAllGlobals();
    });

    it('should handle network errors', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');

      vi.unstubAllGlobals();
    });
  });

  describe('sendToChannel', () => {
    it('should fall back to webhook send', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.sendToChannel(
        '#general',
        'daily_summary',
        {
          date: '2024-01-15',
          openIssues: 10,
          resolvedToday: 5,
          pendingChanges: 3,
          slaBreaches: 0,
        }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return false when webhook not configured', async () => {
      const { slackService } = await import('../../../src/services/slack/index.js');

      expect(slackService.isReady()).toBe(false);
    });
  });

  describe('trackDelivery', () => {
    it('should call trackDelivery when tenantSlug provided and send succeeds', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');
      const { logger } = await import('../../../src/utils/logger.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
        },
        tenantSlug: 'test-tenant',
      });

      expect(result.success).toBe(true);
      // Logger.debug is called when tracking fails (which is expected with mock)
      // This confirms trackDelivery was called
      expect(logger.debug).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('should call trackDelivery when send fails', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');
      const { logger } = await import('../../../src/utils/logger.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
        },
        tenantSlug: 'test-tenant',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network failure');
      // Logger.debug is called when tracking fails (which is expected with mock)
      expect(logger.debug).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('should not call trackDelivery when tenantSlug not provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.clearAllMocks();

      const { slackService } = await import('../../../src/services/slack/index.js');
      const { logger } = await import('../../../src/utils/logger.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
        },
        // No tenantSlug
      });

      // Logger.info is called for successful send, but not debug for tracking
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'issue_assigned' }),
        'Slack message sent successfully'
      );
      vi.unstubAllGlobals();
    });
  });

  describe('additional templates', () => {
    it('should build change_approved message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'change_approved',
        data: {
          changeId: 'CHG001',
          approvedBy: 'Manager',
          scheduledStart: '2024-01-20 02:00:00',
        },
      });

      expect(result.success).toBe(true);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('approved');
      expect(callBody.attachments[0].color).toBe('#16a34a'); // Green

      vi.unstubAllGlobals();
    });

    it('should build change_rejected message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'change_rejected',
        data: {
          changeId: 'CHG001',
          rejectedBy: 'Manager',
          reason: 'Risk too high',
        },
      });

      expect(result.success).toBe(true);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('rejected');
      expect(callBody.attachments[0].color).toBe('#dc2626'); // Red

      vi.unstubAllGlobals();
    });

    it('should build change_rejected message without reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'change_rejected',
        data: {
          changeId: 'CHG001',
          rejectedBy: 'Manager',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[0].text).toContain('No reason provided');

      vi.unstubAllGlobals();
    });

    it('should build health_score_critical message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'health_score_critical',
        data: {
          appName: 'Payment Service',
          score: 25,
          trend: 'declining',
          tier: 'critical',
          appId: 'app-1',
        },
      });

      expect(result.success).toBe(true);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('Critical health score');
      expect(callBody.attachments[0].color).toBe('#dc2626');

      vi.unstubAllGlobals();
    });

    it('should build issue_escalated message without reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_escalated',
        data: {
          issueNumber: 'INC001',
          title: 'Test Issue',
          priority: 'critical',
          escalationLevel: 'Level 3',
          issueId: 'issue-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[2].text).toContain('SLA approaching breach');

      vi.unstubAllGlobals();
    });

    it('should build shift_swap_request without reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'shift_swap_request',
        data: {
          requesterName: 'John',
          scheduleName: 'Weekend On-Call',
          originalStart: '2024-01-20 08:00:00',
          originalEnd: '2024-01-21 08:00:00',
          swapId: 'swap-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[1].text).toContain('Not specified');

      vi.unstubAllGlobals();
    });

    it('should build cab_meeting_reminder without meetingLink', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'cab_meeting_reminder',
        data: {
          meetingTitle: 'Weekly CAB',
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          meetingId: 'meeting-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const actionBlock = callBody.blocks.find((b: any) => b.type === 'actions');
      // Join Meeting button should fall back to base URL
      expect(actionBlock.elements[1].url).toContain('/changes/cab/meeting-1');

      vi.unstubAllGlobals();
    });

    it('should build cab_meeting_reminder without location', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'cab_meeting_reminder',
        data: {
          meetingTitle: 'Weekly CAB',
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          meetingId: 'meeting-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[1].text).toContain('Virtual');

      vi.unstubAllGlobals();
    });

    it('should build issue_assigned without slackUserId', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test Issue',
          priority: 'high',
          issueId: 'issue-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.blocks[0].text.text).toContain('<@user>');

      vi.unstubAllGlobals();
    });
  });

  describe('message template content', () => {
    it('should include baseUrl in message links', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const actionButton = callBody.blocks.find((b: any) => b.type === 'actions');

      expect(actionButton.elements[0].url).toContain('/issues/issue-1');

      vi.unstubAllGlobals();
    });

    it('should format priority in uppercase', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'sla_breach',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15',
          issueId: 'issue-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);

      expect(fieldsSection.fields[0].text).toContain('HIGH');

      vi.unstubAllGlobals();
    });

    it('should include color attachment for alerts', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'sla_breach',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15',
          issueId: 'issue-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);

      expect(callBody.attachments).toBeDefined();
      expect(callBody.attachments[0].color).toBe('#dc2626'); // Red for breach

      vi.unstubAllGlobals();
    });
  });

  describe('template execution with webhooks', () => {
    it('should execute change_approval_required template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'change_approval_required',
        data: {
          changeId: 'CHG001',
          title: 'Database Migration',
          riskLevel: 'high',
          scheduledStart: '2024-01-20 02:00:00',
          requestedBy: 'Developer',
          changeUuid: 'change-uuid',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('requires approval');
      expect(callBody.attachments[0].color).toBe('#d97706'); // Orange for warning
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[1].text).toContain('HIGH');

      vi.unstubAllGlobals();
    });

    it('should execute report_ready template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'report_ready',
        data: {
          reportName: 'Monthly SLA Report',
          reportId: 'report-1',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('Monthly SLA Report');
      expect(callBody.attachments[0].color).toBe('#2563eb'); // Blue

      vi.unstubAllGlobals();
    });

    it('should execute oncall_shift_reminder template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'oncall_shift_reminder',
        data: {
          scheduleName: 'Production Support',
          timeUntil: '30 minutes',
          shiftStart: '2024-01-15 08:00:00',
          shiftEnd: '2024-01-16 08:00:00',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('On-call shift reminder');
      expect(callBody.attachments[0].color).toBe('#2563eb');

      vi.unstubAllGlobals();
    });

    it('should execute shift_swap_accepted template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'shift_swap_accepted',
        data: {
          scheduleName: 'Weekend On-Call',
          accepterName: 'Jane',
          originalStart: '2024-01-20 08:00:00',
          originalEnd: '2024-01-21 08:00:00',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('accepted by Jane');
      expect(callBody.attachments[0].color).toBe('#16a34a'); // Green

      vi.unstubAllGlobals();
    });

    it('should execute problem_rca_completed template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'problem_rca_completed',
        data: {
          problemNumber: 'PRB001',
          title: 'Recurring Server Crashes',
          rootCause: 'Memory leak',
          analyzedBy: 'Engineer',
          problemId: 'problem-1',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toContain('RCA completed');
      expect(callBody.attachments[0].color).toBe('#0ea5e9'); // Sky blue

      vi.unstubAllGlobals();
    });

    it('should execute issue_escalated template with reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'issue_escalated',
        data: {
          issueNumber: 'INC001',
          title: 'Critical System Failure',
          priority: 'critical',
          escalationLevel: 'Level 3',
          reason: 'Customer complaint',
          issueId: 'issue-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[2].text).toContain('Customer complaint');

      vi.unstubAllGlobals();
    });

    it('should execute daily_summary template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'daily_summary',
        data: {
          date: '2024-01-15',
          openIssues: 42,
          resolvedToday: 15,
          pendingChanges: 8,
          slaBreaches: 2,
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toBe('Daily ITSM Summary');
      const actionBlock = callBody.blocks.find((b: any) => b.type === 'actions');
      expect(actionBlock.elements[0].url).toContain('/dashboard');

      vi.unstubAllGlobals();
    });

    it('should execute default template with custom message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'unknown_type',
        data: {
          message: 'Custom notification text',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toBe('Custom notification text');
      expect(callBody.blocks[0].text.text).toBe('Custom notification text');

      vi.unstubAllGlobals();
    });

    it('should execute default template without message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      const result = await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'unknown_type',
        data: {},
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.text).toBe('New notification from FireLater');
      expect(callBody.blocks[0].text.text).toBe('You have a new notification.');

      vi.unstubAllGlobals();
    });

    it('should execute sla_breach template with view issue button', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'sla_breach',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'critical',
          breachedAt: '2024-01-15 10:30:00',
          issueId: 'issue-123',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const actionBlock = callBody.blocks.find((b: any) => b.type === 'actions');
      expect(actionBlock.elements[0].url).toContain('/issues/issue-123');

      vi.unstubAllGlobals();
    });

    it('should execute shift_swap_request with reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'shift_swap_request',
        data: {
          requesterName: 'John',
          scheduleName: 'Weekend On-Call',
          originalStart: '2024-01-20 08:00:00',
          originalEnd: '2024-01-21 08:00:00',
          reason: 'Family event',
          swapId: 'swap-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[1].text).toContain('Family event');

      vi.unstubAllGlobals();
    });

    it('should execute cab_meeting_reminder with location', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'cab_meeting_reminder',
        data: {
          meetingTitle: 'Weekly CAB',
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          location: 'Conference Room A',
          meetingId: 'meeting-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldsSection = callBody.blocks.find((b: any) => b.fields);
      expect(fieldsSection.fields[1].text).toContain('Conference Room A');

      vi.unstubAllGlobals();
    });

    it('should execute cab_meeting_reminder with meetingLink', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { slackService } = await import('../../../src/services/slack/index.js');

      await slackService.send({
        webhookUrl: 'https://hooks.slack.com/test',
        type: 'cab_meeting_reminder',
        data: {
          meetingTitle: 'Weekly CAB',
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          meetingLink: 'https://zoom.us/j/123456789',
          meetingId: 'meeting-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const actionBlock = callBody.blocks.find((b: any) => b.type === 'actions');
      expect(actionBlock.elements[1].url).toBe('https://zoom.us/j/123456789');

      vi.unstubAllGlobals();
    });
  });

});
