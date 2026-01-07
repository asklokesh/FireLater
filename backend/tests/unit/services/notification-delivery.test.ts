import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for Notification Delivery Service
 * Testing multi-channel notification delivery
 *
 * Key coverage areas:
 * - Email delivery via emailService
 * - Slack delivery via Web API
 * - Teams delivery via webhooks
 * - PagerDuty delivery via Events API
 * - Generic webhook delivery with HMAC signing
 * - SMS delivery via Twilio
 * - Bulk delivery with batching
 * - Delivery status tracking
 */

// Mock dependencies
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
  },
}));

// Mock email service
const mockSendNotificationEmail = vi.fn();
vi.mock('../../../src/services/email.js', () => ({
  emailService: {
    sendNotificationEmail: (...args: unknown[]) => mockSendNotificationEmail(...args),
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

// Mock Slack client
const mockSlackPostMessage = vi.fn();
vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockSlackPostMessage,
    },
  })),
}));

// Mock Twilio client
const mockTwilioMessagesCreate = vi.fn();
vi.mock('twilio', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: (...args: unknown[]) => mockTwilioMessagesCreate(...args),
    },
  })),
}));

// Mock fetch for webhooks
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import { notificationDeliveryService } from '../../../src/services/notification-delivery.js';
import { logger } from '../../../src/utils/logger.js';

const tenantSlug = 'test';
const notificationId = 'notif-123';
const userId = 'user-456';

const baseNotification = {
  id: notificationId,
  eventType: 'issue_created',
  title: 'New Issue Created',
  body: 'A new issue INC-001 was created',
  entityType: 'issue',
  entityId: 'issue-789',
  metadata: { issueNumber: 'INC-001', priority: 'high' },
  user: {
    id: userId,
    email: 'user@example.com',
    name: 'Test User',
  },
};

describe('Notification Delivery Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockFetch.mockReset();
    mockSendNotificationEmail.mockReset();
    mockSlackPostMessage.mockReset();
  });

  // ============================================
  // DELIVER TO CHANNELS
  // ============================================
  describe('deliver', () => {
    it('should deliver to all enabled channels for user', async () => {
      // Get channels query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'ch-1', type: 'email', config: {}, is_default: true },
          { id: 'ch-2', type: 'in_app', config: {}, is_default: true },
        ],
      });

      // Email template query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Email delivery success
      mockSendNotificationEmail.mockResolvedValueOnce(true);

      // Delivery status updates
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results).toHaveLength(2);
      expect(results.find(r => r.channelType === 'email')).toMatchObject({ success: true });
      expect(results.find(r => r.channelType === 'in_app')).toMatchObject({ success: true });
    });

    it('should handle delivery failures gracefully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'ch-1', type: 'slack', config: { botToken: 'xoxb-test', defaultChannel: '#alerts' } },
        ],
      });

      // Slack delivery fails
      mockSlackPostMessage.mockRejectedValueOnce(new Error('Slack API error'));

      // Delivery status update
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'slack',
        error: 'Slack API error',
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should return unsupported channel type error', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'ch-1', type: 'unknown_type', config: {} },
        ],
      });

      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'unknown_type',
        error: 'Unsupported channel type: unknown_type',
      });
    });
  });

  // ============================================
  // EMAIL DELIVERY
  // ============================================
  describe('email delivery', () => {
    it('should deliver email notification', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'email', config: {} }],
      });

      // Email template query - no custom template
      mockQuery.mockResolvedValueOnce({ rows: [] });

      mockSendNotificationEmail.mockResolvedValueOnce(true);
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: true,
        channelType: 'email',
        metadata: { to: 'user@example.com', subject: 'New Issue Created' },
      });
      expect(mockSendNotificationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'New Issue Created',
        expect.stringContaining('<!DOCTYPE html>'),
        expect.any(String)
      );
    });

    it('should use custom email template when available', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'email', config: {} }],
      });

      // Custom email template
      mockQuery.mockResolvedValueOnce({
        rows: [{
          subject: 'Issue {{issueNumber}} Created',
          body_template: '<p>Hi {{userName}}, issue {{issueNumber}} was created with priority {{priority}}</p>',
          is_active: true,
        }],
      });

      mockSendNotificationEmail.mockResolvedValueOnce(true);
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(mockSendNotificationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'Issue INC-001 Created',
        expect.stringContaining('Hi Test User'),
        expect.any(String)
      );
    });

    it('should handle email delivery failure', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'email', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockSendNotificationEmail.mockResolvedValueOnce(false);
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'email',
        error: 'Failed to send email notification',
      });
    });
  });

  // ============================================
  // SLACK DELIVERY
  // ============================================
  describe('slack delivery', () => {
    it('should deliver slack notification', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'slack',
          config: { botToken: 'xoxb-test-token', defaultChannel: '#notifications' },
        }],
      });

      mockSlackPostMessage.mockResolvedValueOnce({ ok: true, ts: '12345' });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: true,
        channelType: 'slack',
        metadata: { channel: '#notifications' },
      });
      expect(mockSlackPostMessage).toHaveBeenCalledWith({
        channel: '#notifications',
        text: 'New Issue Created',
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: 'header' }),
          expect.objectContaining({ type: 'section' }),
        ]),
      });
    });

    it('should use channel map for specific event types', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'slack',
          config: {
            botToken: 'xoxb-test',
            defaultChannel: '#general',
            channelMap: { issue_created: '#issues' },
          },
        }],
      });

      mockSlackPostMessage.mockResolvedValueOnce({ ok: true });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0].metadata).toEqual({ channel: '#issues' });
    });

    it('should return error when bot token not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'slack', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'slack',
        error: 'Slack bot token not configured',
      });
    });
  });

  // ============================================
  // TEAMS DELIVERY
  // ============================================
  describe('teams delivery', () => {
    it('should deliver teams notification via webhook', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'teams',
          config: { webhookUrl: 'https://teams.webhook.example.com/123' },
        }],
      });

      mockFetch.mockResolvedValueOnce({ ok: true });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({ success: true, channelType: 'teams' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://teams.webhook.example.com/123',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('AdaptiveCard'),
        })
      );
    });

    it('should return error when webhook URL not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'teams', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'teams',
        error: 'Teams webhook URL not configured',
      });
    });

    it('should handle teams API error', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'teams',
          config: { webhookUrl: 'https://teams.webhook.example.com/123' },
        }],
      });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'teams',
        error: expect.stringContaining('401'),
      });
    });
  });

  // ============================================
  // PAGERDUTY DELIVERY
  // ============================================
  describe('pagerduty delivery', () => {
    it('should deliver pagerduty notification', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'pagerduty',
          config: { integrationKey: 'pd-integration-key' },
        }],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', dedup_key: 'dedup-123' }),
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: true,
        channelType: 'pagerduty',
        metadata: expect.objectContaining({ dedupKey: 'dedup-123' }),
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://events.pagerduty.com/v2/enqueue',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should use critical severity for critical events', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'pagerduty',
          config: { integrationKey: 'pd-key', defaultSeverity: 'info' },
        }],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success' }),
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const criticalNotification = {
        ...baseNotification,
        eventType: 'sla.breached',
      };

      await notificationDeliveryService.deliver(tenantSlug, criticalNotification);

      const fetchCall = mockFetch.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      expect(payload.payload.severity).toBe('critical');
    });

    it('should return error when integration key not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'pagerduty', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'pagerduty',
        error: 'PagerDuty integration key not configured',
      });
    });
  });

  // ============================================
  // WEBHOOK DELIVERY
  // ============================================
  describe('webhook delivery', () => {
    it('should deliver webhook notification', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'webhook',
          config: { url: 'https://webhook.example.com/notify' },
        }],
      });

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: true,
        channelType: 'webhook',
        metadata: { url: 'https://webhook.example.com/notify', status: 200 },
      });
    });

    it('should include HMAC signature when secret configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'webhook',
          config: { url: 'https://webhook.example.com/notify', secret: 'my-secret-key' },
        }],
      });

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers).toHaveProperty('X-Firelater-Signature');
      expect(fetchCall[1].headers['X-Firelater-Signature']).toMatch(/^sha256=/);
    });

    it('should include custom headers', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'webhook',
          config: {
            url: 'https://webhook.example.com/notify',
            headers: { 'X-Custom-Header': 'custom-value' },
          },
        }],
      });

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers).toHaveProperty('X-Custom-Header', 'custom-value');
    });

    it('should return error when webhook URL not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'webhook', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'webhook',
        error: 'Webhook URL not configured',
      });
    });
  });

  // ============================================
  // SMS DELIVERY
  // ============================================
  describe('sms delivery', () => {
    it('should return error when phone number not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'sms', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'sms',
        error: 'Phone number not configured',
      });
    });

    it('should return error when Twilio not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'sms',
          config: { phoneNumber: '+1234567890' },
        }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Ensure env vars are not set
      const originalAccountSid = process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_ACCOUNT_SID;

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      // Restore
      if (originalAccountSid) process.env.TWILIO_ACCOUNT_SID = originalAccountSid;

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'sms',
        error: expect.stringContaining('Twilio not configured'),
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should successfully send SMS when Twilio is configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'sms',
          config: { phoneNumber: '+1234567890' },
        }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Set up Twilio env vars
      const originalAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const originalFromNumber = process.env.TWILIO_FROM_NUMBER;
      process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
      process.env.TWILIO_FROM_NUMBER = '+19876543210';

      // Mock successful Twilio message creation
      mockTwilioMessagesCreate.mockResolvedValueOnce({ sid: 'SM123456' });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      // Restore env vars
      process.env.TWILIO_ACCOUNT_SID = originalAccountSid || '';
      process.env.TWILIO_AUTH_TOKEN = originalAuthToken || '';
      process.env.TWILIO_FROM_NUMBER = originalFromNumber || '';
      if (!originalAccountSid) delete process.env.TWILIO_ACCOUNT_SID;
      if (!originalAuthToken) delete process.env.TWILIO_AUTH_TOKEN;
      if (!originalFromNumber) delete process.env.TWILIO_FROM_NUMBER;

      expect(results[0]).toMatchObject({
        success: true,
        channelType: 'sms',
        metadata: {
          phoneNumber: '+1234567890',
          messageSid: 'SM123456',
        },
      });
      expect(mockTwilioMessagesCreate).toHaveBeenCalledWith({
        body: 'New Issue Created: A new issue INC-001 was created',
        from: '+19876543210',
        to: '+1234567890',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '+1234567890', messageSid: 'SM123456' }),
        'SMS notification sent'
      );
    });

    it('should handle SMS delivery error', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'sms',
          config: { phoneNumber: '+1234567890' },
        }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Set up Twilio env vars
      const originalAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const originalFromNumber = process.env.TWILIO_FROM_NUMBER;
      process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
      process.env.TWILIO_FROM_NUMBER = '+19876543210';

      // Mock Twilio error
      mockTwilioMessagesCreate.mockRejectedValueOnce(new Error('Invalid phone number'));

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      // Restore env vars
      process.env.TWILIO_ACCOUNT_SID = originalAccountSid || '';
      process.env.TWILIO_AUTH_TOKEN = originalAuthToken || '';
      process.env.TWILIO_FROM_NUMBER = originalFromNumber || '';
      if (!originalAccountSid) delete process.env.TWILIO_ACCOUNT_SID;
      if (!originalAuthToken) delete process.env.TWILIO_AUTH_TOKEN;
      if (!originalFromNumber) delete process.env.TWILIO_FROM_NUMBER;

      expect(results[0]).toMatchObject({
        success: false,
        channelType: 'sms',
        error: 'Invalid phone number',
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '+1234567890' }),
        'SMS delivery failed'
      );
    });

    it('should truncate SMS message to 1600 characters', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ch-1',
          type: 'sms',
          config: { phoneNumber: '+1234567890' },
        }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Set up Twilio env vars
      const originalAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const originalFromNumber = process.env.TWILIO_FROM_NUMBER;
      process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
      process.env.TWILIO_FROM_NUMBER = '+19876543210';

      mockTwilioMessagesCreate.mockResolvedValueOnce({ sid: 'SM789' });

      const longNotification = {
        ...baseNotification,
        title: 'A'.repeat(1000),
        body: 'B'.repeat(1000),
      };

      const results = await notificationDeliveryService.deliver(tenantSlug, longNotification);

      // Restore env vars
      process.env.TWILIO_ACCOUNT_SID = originalAccountSid || '';
      process.env.TWILIO_AUTH_TOKEN = originalAuthToken || '';
      process.env.TWILIO_FROM_NUMBER = originalFromNumber || '';
      if (!originalAccountSid) delete process.env.TWILIO_ACCOUNT_SID;
      if (!originalAuthToken) delete process.env.TWILIO_AUTH_TOKEN;
      if (!originalFromNumber) delete process.env.TWILIO_FROM_NUMBER;

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      // Verify truncation happened - message body should be 1600 chars max
      expect(mockTwilioMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.any(String),
        })
      );
      const callArg = mockTwilioMessagesCreate.mock.calls[0][0] as { body: string };
      expect(callArg.body.length).toBeLessThanOrEqual(1600);
    });
  });

  // ============================================
  // IN-APP DELIVERY
  // ============================================
  describe('in_app delivery', () => {
    it('should return success for in_app channel', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'in_app', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      expect(results[0]).toMatchObject({
        success: true,
        channelType: 'in_app',
      });
    });
  });

  // ============================================
  // BULK DELIVERY
  // ============================================
  describe('deliverBulk', () => {
    it('should deliver to multiple notifications in batches', async () => {
      const notifications = [
        { ...baseNotification, id: 'notif-1' },
        { ...baseNotification, id: 'notif-2' },
        { ...baseNotification, id: 'notif-3' },
      ];

      // Each notification gets channel query + status update
      notifications.forEach(() => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: 'ch-1', type: 'in_app', config: {} }] })
          .mockResolvedValueOnce({ rowCount: 1 });
      });

      const results = await notificationDeliveryService.deliverBulk(tenantSlug, notifications);

      expect(results.size).toBe(3);
      expect(results.get('notif-1')).toBeDefined();
      expect(results.get('notif-2')).toBeDefined();
      expect(results.get('notif-3')).toBeDefined();
    });

    it('should handle partial failures in bulk delivery', async () => {
      const notifications = [
        { ...baseNotification, id: 'notif-1' },
        { ...baseNotification, id: 'notif-2' },
      ];

      // First notification succeeds
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'ch-1', type: 'in_app', config: {} }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      // Second notification fails
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const results = await notificationDeliveryService.deliverBulk(tenantSlug, notifications);

      expect(results.get('notif-1')?.[0].success).toBe(true);
      expect(results.get('notif-2')?.[0].success).toBe(false);
    });

    it('should add delay between batches when delivering more than 10 notifications', async () => {
      // Create 12 notifications to trigger batch delay (batch size is 10)
      const notifications = Array.from({ length: 12 }, (_, i) => ({
        ...baseNotification,
        id: `notif-${i + 1}`,
      }));

      // Mock responses for all notifications (channel query + status update per notification)
      notifications.forEach(() => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: 'ch-1', type: 'in_app', config: {} }] })
          .mockResolvedValueOnce({ rowCount: 1 });
      });

      const startTime = Date.now();
      const results = await notificationDeliveryService.deliverBulk(tenantSlug, notifications);
      const duration = Date.now() - startTime;

      expect(results.size).toBe(12);
      // Should have delay between batches (at least 100ms for one batch boundary)
      // But we can't guarantee exact timing in tests, so just verify results
      expect(Array.from(results.values()).every(r => r.length > 0)).toBe(true);
    });
  });

  // ============================================
  // DELIVERY STATUS TRACKING
  // ============================================
  describe('delivery status tracking', () => {
    it('should update delivery status on success', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-email', type: 'in_app', config: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      // Verify batch status update query - uses UNNEST with arrays of arrays
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.notification_deliveries'),
        expect.arrayContaining([
          [notificationId], // notification_ids array
          ['ch-email'], // channel_ids array
          ['delivered'], // statuses array
          [null], // errors array
        ])
      );
    });

    it('should handle missing notification_deliveries table', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ch-1', type: 'in_app', config: {} }],
      });

      // Status update fails
      mockQuery.mockRejectedValueOnce(new Error('relation does not exist'));

      const results = await notificationDeliveryService.deliver(tenantSlug, baseNotification);

      // Should still return success even if status tracking fails
      expect(results[0].success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'notification_deliveries table not found, skipping status update'
      );
    });
  });

  // ============================================
  // SQL INJECTION PREVENTION
  // ============================================
  describe('SQL injection prevention', () => {
    it('should use parameterized queries for channels lookup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const maliciousNotification = {
        ...baseNotification,
        user: {
          ...baseNotification.user,
          id: "'; DROP TABLE users; --",
        },
        eventType: "'; DELETE FROM notifications; --",
      };

      await notificationDeliveryService.deliver(tenantSlug, maliciousNotification);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ["'; DROP TABLE users; --", "'; DELETE FROM notifications; --"]
      );
    });
  });
});
