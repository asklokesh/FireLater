import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/config/index.js', () => ({
  config: {
    isDev: true,
    teams: {
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
    getSchemaName: vi.fn().mockReturnValue('"tenant_test"'),
  },
}));

describe('TeamsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('buildTeamsMessage', () => {
    it('should build SLA breach message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
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
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC002',
          title: 'Server Down',
          priority: 'critical',
          issueId: 'issue-2',
          assigneeName: 'John Doe',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build change approval required message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'change_approval_required',
        data: {
          changeId: 'CHG001',
          title: 'Database Migration',
          riskLevel: 'high',
          requestedBy: 'John Doe',
          scheduledStart: '2024-01-20 02:00:00',
          changeUuid: 'change-uuid-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build change approved message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'change_approved',
        data: {
          changeId: 'CHG001',
          approvedBy: 'Jane Manager',
          scheduledStart: '2024-01-20 02:00:00',
          changeUuid: 'change-uuid-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build change rejected message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'change_rejected',
        data: {
          changeId: 'CHG001',
          rejectedBy: 'Jane Manager',
          reason: 'Insufficient testing',
          changeUuid: 'change-uuid-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build health score critical message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'health_score_critical',
        data: {
          appName: 'CRM System',
          score: 25,
          trend: 'declining',
          tier: 'critical',
          appId: 'app-1',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build oncall shift reminder message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
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
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
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

    it('should build CAB meeting reminder message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'cab_meeting_reminder',
        data: {
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          location: 'Conference Room A',
          meetingId: 'meeting-1',
          meetingLink: 'https://teams.microsoft.com/join/123',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should build issue escalated message', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
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
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
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
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'unknown_type',
        data: {
          message: 'Custom notification message',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should use default message when no message provided', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        type: 'default',
        data: {},
      });

      expect(result.success).toBe(true);
    });
  });

  describe('send', () => {
    it('should return success when webhook not configured', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');
      const { logger } = await import('../../../src/utils/logger.js');

      const result = await teamsService.send({
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
        'Teams message would be sent (webhook not configured)'
      );
    });

    it('should send message when webhook is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test Issue',
          priority: 'medium',
          issueId: 'issue-1',
          assigneeName: 'John Doe',
        },
      });

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://outlook.office.com/webhook/test',
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

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
          assigneeName: 'John Doe',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Teams API error');

      vi.unstubAllGlobals();
    });

    it('should handle network errors', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
          assigneeName: 'John Doe',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');

      vi.unstubAllGlobals();
    });
  });

  describe('isReady', () => {
    it('should return false when webhook not configured', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');

      expect(teamsService.isReady()).toBe(false);
    });
  });

  describe('message template content', () => {
    it('should include baseUrl in message links', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC001',
          title: 'Test',
          priority: 'medium',
          issueId: 'issue-1',
          assigneeName: 'John Doe',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const actions = callBody.attachments[0].content.actions;

      expect(actions[0].url).toContain('/issues/issue-1');

      vi.unstubAllGlobals();
    });

    it('should format priority in uppercase', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
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
      const content = callBody.attachments[0].content;
      const factSet = content.body.find((b: any) => b.type === 'FactSet');

      expect(factSet.facts[0].value).toBe('HIGH');

      vi.unstubAllGlobals();
    });

    it('should use Adaptive Card format', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
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

      expect(callBody.type).toBe('message');
      expect(callBody.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
      expect(callBody.attachments[0].content.type).toBe('AdaptiveCard');
      expect(callBody.attachments[0].content.version).toBe('1.4');

      vi.unstubAllGlobals();
    });

    it('should include msteams width property', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
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
      const content = callBody.attachments[0].content;

      expect(content.msteams).toEqual({ width: 'Full' });

      vi.unstubAllGlobals();
    });
  });

  describe('template execution with webhook', () => {
    it('should execute change_approval_required template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'change_approval_required',
        data: {
          changeId: 'CHG001',
          title: 'Database Migration',
          riskLevel: 'high',
          requestedBy: 'John Doe',
          scheduledStart: '2024-01-20 02:00:00',
          changeUuid: 'change-uuid-1',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.attachments[0].content.body[0].text).toBe('Change Approval Required');
      expect(callBody.attachments[0].content.body[0].color).toBe('Warning');
      const factSet = callBody.attachments[0].content.body.find((b: any) => b.type === 'FactSet');
      expect(factSet.facts[1].value).toBe('HIGH');
      expect(callBody.attachments[0].content.actions[0].url).toContain('/changes/change-uuid-1/approve');
      vi.unstubAllGlobals();
    });

    it('should execute change_approved template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'change_approved',
        data: {
          changeId: 'CHG001',
          approvedBy: 'Manager',
          scheduledStart: '2024-01-20 02:00:00',
          changeUuid: 'change-uuid',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.attachments[0].content.body[0].color).toBe('Good');
      vi.unstubAllGlobals();
    });

    it('should execute change_rejected template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'change_rejected',
        data: {
          changeId: 'CHG001',
          rejectedBy: 'Manager',
          reason: 'Risk too high',
          changeUuid: 'change-uuid',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.attachments[0].content.body[0].color).toBe('Attention');
      vi.unstubAllGlobals();
    });

    it('should execute change_rejected template without reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'change_rejected',
        data: {
          changeId: 'CHG001',
          rejectedBy: 'Manager',
          changeUuid: 'change-uuid',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const factSet = callBody.attachments[0].content.body.find((b: any) => b.type === 'FactSet');
      expect(factSet.facts[0].value).toBe('No reason provided');
      vi.unstubAllGlobals();
    });

    it('should execute health_score_critical template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
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
      expect(callBody.attachments[0].content.body[0].text).toBe('Critical Health Score Alert');
      vi.unstubAllGlobals();
    });

    it('should execute oncall_shift_reminder template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'oncall_shift_reminder',
        data: {
          scheduleName: 'IT Support',
          timeUntil: '30 minutes',
          shiftStart: '2024-01-15 18:00:00',
          shiftEnd: '2024-01-16 06:00:00',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.attachments[0].content.actions.length).toBe(2);
      vi.unstubAllGlobals();
    });

    it('should execute shift_swap_request template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'shift_swap_request',
        data: {
          requesterName: 'John',
          scheduleName: 'Weekend On-Call',
          originalStart: '2024-01-20 08:00:00',
          originalEnd: '2024-01-21 08:00:00',
          reason: 'Personal appointment',
          swapId: 'swap-1',
        },
      });

      expect(result.success).toBe(true);
      vi.unstubAllGlobals();
    });

    it('should execute shift_swap_request template without reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
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
      const factSet = callBody.attachments[0].content.body.find((b: any) => b.type === 'FactSet');
      expect(factSet.facts[1].value).toBe('Not specified');
      vi.unstubAllGlobals();
    });

    it('should execute cab_meeting_reminder template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'cab_meeting_reminder',
        data: {
          meetingTitle: 'Weekly CAB',
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          location: 'Conference Room A',
          meetingId: 'meeting-1',
          meetingLink: 'https://teams.microsoft.com/meet',
        },
      });

      expect(result.success).toBe(true);
      vi.unstubAllGlobals();
    });

    it('should execute cab_meeting_reminder template without location', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'cab_meeting_reminder',
        data: {
          meetingTitle: 'Weekly CAB',
          meetingDate: '2024-01-16 14:00:00',
          changeCount: 5,
          meetingId: 'meeting-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const factSet = callBody.attachments[0].content.body.find((b: any) => b.type === 'FactSet');
      expect(factSet.facts[1].value).toBe('Virtual');
      vi.unstubAllGlobals();
    });

    it('should execute issue_escalated template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'issue_escalated',
        data: {
          issueNumber: 'INC001',
          title: 'Critical Issue',
          priority: 'critical',
          escalationLevel: 'Level 3',
          reason: 'Customer impacting',
          issueId: 'issue-1',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.attachments[0].content.body[0].text).toBe('Issue Escalated');
      vi.unstubAllGlobals();
    });

    it('should execute issue_escalated template without reason', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'issue_escalated',
        data: {
          issueNumber: 'INC001',
          title: 'Critical Issue',
          priority: 'critical',
          escalationLevel: 'Level 3',
          issueId: 'issue-1',
        },
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const factSet = callBody.attachments[0].content.body.find((b: any) => b.type === 'FactSet');
      expect(factSet.facts[2].value).toBe('SLA approaching breach');
      vi.unstubAllGlobals();
    });

    it('should execute daily_summary template', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
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
      expect(callBody.attachments[0].content.body[0].text).toBe('Daily ITSM Summary');
      vi.unstubAllGlobals();
    });

    it('should execute default template for unknown type', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'unknown_type',
        data: {
          message: 'Custom notification',
        },
      });

      expect(result.success).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.attachments[0].content.body[0].text).toBe('FireLater Notification');
      expect(callBody.attachments[0].content.body[1].text).toBe('Custom notification');
      vi.unstubAllGlobals();
    });

    it('should execute default template without message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'default',
        data: {},
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.attachments[0].content.body[1].text).toBe('You have a new notification.');
      vi.unstubAllGlobals();
    });
  });

  describe('isReady', () => {
    it('should return false when webhook not configured', async () => {
      const { teamsService } = await import('../../../src/services/teams/index.js');
      expect(teamsService.isReady()).toBe(false);
    });
  });

  describe('trackDelivery', () => {
    it('should track successful delivery when tenantSlug provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { pool } = await import('../../../src/config/database.js');
      (pool.query as any).mockResolvedValueOnce({ rows: [{ exists: true }] });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'sla_breach',
        tenantSlug: 'test-tenant',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15',
          issueId: 'issue-1',
        },
      });

      expect(pool.query).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should track failed delivery when tenantSlug provided', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Send failed'));
      vi.stubGlobal('fetch', fetchMock);

      const { pool } = await import('../../../src/config/database.js');
      (pool.query as any).mockResolvedValueOnce({ rows: [{ exists: true }] });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'sla_breach',
        tenantSlug: 'test-tenant',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15',
          issueId: 'issue-1',
        },
      });

      expect(pool.query).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it('should handle trackDelivery error gracefully', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { pool } = await import('../../../src/config/database.js');
      const { logger } = await import('../../../src/utils/logger.js');
      // Table exists check succeeds
      (pool.query as any).mockResolvedValueOnce({ rows: [{ exists: true }] });
      // Insert fails
      (pool.query as any).mockRejectedValueOnce(new Error('DB connection error'));

      const { teamsService } = await import('../../../src/services/teams/index.js');

      const result = await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'sla_breach',
        tenantSlug: 'test-tenant',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15',
          issueId: 'issue-1',
        },
      });

      // Should still succeed - trackDelivery errors are swallowed
      expect(result.success).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to track Teams delivery'
      );

      vi.unstubAllGlobals();
    });

    it('should skip tracking if notification_deliveries table does not exist', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { pool } = await import('../../../src/config/database.js');
      (pool.query as any).mockResolvedValueOnce({ rows: [{ exists: false }] });

      const { teamsService } = await import('../../../src/services/teams/index.js');

      await teamsService.send({
        webhookUrl: 'https://outlook.office.com/webhook/test',
        type: 'sla_breach',
        tenantSlug: 'test-tenant',
        data: {
          issueNumber: 'INC001',
          breachType: 'Response',
          priority: 'high',
          breachedAt: '2024-01-15',
          issueId: 'issue-1',
        },
      });

      // Should only check table existence, not insert
      expect(pool.query).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });
  });
});
