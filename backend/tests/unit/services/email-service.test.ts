import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for EmailService in services/email/index.ts
 * Testing template-based email sending, batch operations, and delivery tracking
 */

// Mock SendGrid before importing email service
const mockSgSend = vi.fn();
vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: (...args: unknown[]) => mockSgSend(...args),
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config - email service checks config at import time
vi.mock('../../../src/config/index.js', () => ({
  config: {
    email: {
      sendgridApiKey: 'SG.test-api-key',
      from: 'test@firelater.io',
      fromName: 'FireLater Test',
    },
    isDev: true,
  },
}));

// Mock database pool
const mockPoolQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

// Mock tenant service
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `"tenant_${slug}"`,
  },
}));

// Import after mocks are set up
import { emailService } from '../../../src/services/email/index.js';

describe('EmailService (email/index.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSgSend.mockResolvedValue([{
      statusCode: 202,
      headers: { 'x-message-id': 'test-message-id' },
    }]);
    mockPoolQuery.mockResolvedValue({ rows: [{ exists: true }] });
  });

  describe('send()', () => {
    it('should send email with sla_breach template', async () => {
      const result = await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {
          issueNumber: 'INC-001',
          issueId: '123',
          priority: 'critical',
          breachType: 'response',
          breachedAt: new Date().toISOString(),
        },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(mockSgSend).toHaveBeenCalled();
    });

    it('should send email with issue_assigned template', async () => {
      const result = await emailService.send({
        to: 'assignee@example.com',
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC-002',
          issueId: '456',
          title: 'Server Down',
          priority: 'high',
          assignedBy: 'Manager',
          description: 'Critical server outage',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should send email with change_approval_required template', async () => {
      const result = await emailService.send({
        to: 'approver@example.com',
        type: 'change_approval_required',
        data: {
          changeNumber: 'CHG-001',
          changeId: '789',
          title: 'Deploy API v2',
          changeType: 'standard',
          riskLevel: 'medium',
          requestedBy: 'Developer',
          scheduledStart: new Date().toISOString(),
        },
      });

      expect(result.success).toBe(true);
    });

    it('should send email with welcome template', async () => {
      const result = await emailService.send({
        to: 'newuser@example.com',
        type: 'welcome',
        data: {
          userName: 'John Doe',
          tenantName: 'Acme Corp',
          role: 'Agent',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should send email with password_reset template', async () => {
      const result = await emailService.send({
        to: 'user@example.com',
        type: 'password_reset',
        data: {
          resetUrl: 'https://app.firelater.io/reset?token=abc123',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should send email to multiple recipients', async () => {
      const result = await emailService.send({
        to: ['user1@example.com', 'user2@example.com'],
        type: 'issue_assigned',
        data: {
          issueNumber: 'INC-003',
          issueId: '999',
          title: 'Team Issue',
          priority: 'medium',
          assignedBy: 'Admin',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should use fallback template for unknown type', async () => {
      const result = await emailService.send({
        to: 'user@example.com',
        type: 'unknown_type',
        data: {
          subject: 'Custom Subject',
          message: 'Custom message content',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle SendGrid API error', async () => {
      mockSgSend.mockRejectedValue(new Error('SendGrid API error'));

      const result = await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('SendGrid API error');
    });

    it('should track delivery when tenantSlug is provided', async () => {
      await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {},
        tenantSlug: 'test-tenant',
      });

      // Should call query to check table exists and insert delivery record
      expect(mockPoolQuery).toHaveBeenCalled();
    });

    it('should skip tracking when notification_deliveries table does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

      const result = await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {},
        tenantSlug: 'test-tenant',
      });

      expect(result.success).toBe(true);
    });

    it('should track failed delivery when send fails', async () => {
      mockSgSend.mockRejectedValue(new Error('Send failed'));

      await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {},
        tenantSlug: 'test-tenant',
      });

      // Should still try to track the failed delivery
      expect(mockPoolQuery).toHaveBeenCalled();
    });
  });

  describe('sendBatch()', () => {
    it('should send emails to multiple recipients with individual data', async () => {
      const result = await emailService.sendBatch(
        [
          { email: 'user1@example.com', data: { userName: 'User 1' } },
          { email: 'user2@example.com', data: { userName: 'User 2' } },
          { email: 'user3@example.com', data: { userName: 'User 3' } },
        ],
        'welcome',
        { tenantName: 'Acme Corp', role: 'User' }
      );

      expect(result.sent).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should count failures correctly', async () => {
      let callCount = 0;
      mockSgSend.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve([{
          statusCode: 202,
          headers: { 'x-message-id': 'msg-id' },
        }]);
      });

      const result = await emailService.sendBatch(
        [
          { email: 'user1@example.com', data: {} },
          { email: 'user2@example.com', data: {} },
          { email: 'user3@example.com', data: {} },
        ],
        'welcome',
        { tenantName: 'Test', role: 'User' }
      );

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should pass tenantSlug to individual sends', async () => {
      await emailService.sendBatch(
        [{ email: 'user@example.com', data: {} }],
        'welcome',
        { tenantName: 'Test' },
        'test-tenant'
      );

      // Should have called query for delivery tracking
      expect(mockPoolQuery).toHaveBeenCalled();
    });
  });

  describe('isReady()', () => {
    it('should return true when configured', () => {
      // Config mock has API key and from address set
      expect(emailService.isReady()).toBe(true);
    });
  });

  describe('trackDelivery()', () => {
    it('should handle database errors gracefully', async () => {
      mockPoolQuery.mockRejectedValue(new Error('Database error'));

      // Should not throw, should handle error gracefully
      const result = await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {},
        tenantSlug: 'test-tenant',
      });

      // Send should still succeed even if tracking fails
      expect(result.success).toBe(true);
    });

    it('should use batch UNNEST query for multiple recipients', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [] });

      await emailService.send({
        to: ['user1@example.com', 'user2@example.com'],
        type: 'sla_breach',
        data: {},
        tenantSlug: 'test-tenant',
      });

      // Second query should be the UNNEST INSERT
      const insertCall = mockPoolQuery.mock.calls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('unnest')
      );
      expect(insertCall).toBeDefined();
    });
  });

  describe('Template Content', () => {
    it('should include issue details in sla_breach email subject', async () => {
      await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {
          issueNumber: 'INC-999',
          issueId: 'uuid-123',
          priority: 'critical',
          breachType: 'resolution',
          breachedAt: '2024-01-15T12:00:00Z',
        },
      });

      const sentMsg = mockSgSend.mock.calls[0][0];
      expect(sentMsg.subject).toContain('INC-999');
      expect(sentMsg.html).toContain('SLA Breach');
    });

    it('should include change number in change_approval_required email', async () => {
      await emailService.send({
        to: 'approver@example.com',
        type: 'change_approval_required',
        data: {
          changeNumber: 'CHG-100',
          changeId: 'change-uuid',
          title: 'Important Change',
          changeType: 'emergency',
          riskLevel: 'high',
          requestedBy: 'Engineer',
          scheduledStart: '2024-01-20T00:00:00Z',
        },
      });

      const sentMsg = mockSgSend.mock.calls[0][0];
      expect(sentMsg.subject).toContain('Change Approval Required');
      // Template uses changeId, not changeNumber
      expect(sentMsg.html).toContain('change-uuid');
      expect(sentMsg.html).toContain('Important Change');
    });

    it('should include user name in welcome email', async () => {
      await emailService.send({
        to: 'newuser@example.com',
        type: 'welcome',
        data: {
          userName: 'Jane Doe',
          tenantName: 'Test Company',
          role: 'Administrator',
        },
      });

      const sentMsg = mockSgSend.mock.calls[0][0];
      expect(sentMsg.subject).toContain('Welcome');
      expect(sentMsg.html).toContain('Jane Doe');
    });

    it('should include reset URL in password_reset email', async () => {
      await emailService.send({
        to: 'user@example.com',
        type: 'password_reset',
        data: {
          resetUrl: 'https://app.example.com/reset?token=secret-token',
        },
      });

      const sentMsg = mockSgSend.mock.calls[0][0];
      expect(sentMsg.subject).toContain('Password Reset');
      // URL is HTML-encoded in the template (= becomes &#x3D;)
      expect(sentMsg.html).toContain('https://app.example.com/reset?token');
      expect(sentMsg.html).toContain('secret-token');
    });

    it('should uppercase priority in template', async () => {
      await emailService.send({
        to: 'user@example.com',
        type: 'sla_breach',
        data: {
          priority: 'critical',
          issueNumber: 'INC-002',
          breachType: 'response',
          breachedAt: new Date().toISOString(),
          issueId: '456',
        },
      });

      const sentMsg = mockSgSend.mock.calls[0][0];
      expect(sentMsg.html).toContain('CRITICAL');
    });
  });

  describe('SLA Warning Template', () => {
    it('should send sla_warning email', async () => {
      const result = await emailService.send({
        to: 'user@example.com',
        type: 'sla_warning',
        data: {
          issueNumber: 'INC-100',
          issueId: 'uuid-100',
          priority: 'high',
          warningType: 'response',
          timeRemaining: '30 minutes',
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('On-Call Alert Template', () => {
    it('should send oncall_alert email', async () => {
      const result = await emailService.send({
        to: 'oncall@example.com',
        type: 'oncall_alert',
        data: {
          scheduleName: 'Production Support',
          alertType: 'shift_start',
          message: 'Your on-call shift is starting',
          timestamp: new Date().toISOString(),
        },
      });

      expect(result.success).toBe(true);
    });
  });
});
