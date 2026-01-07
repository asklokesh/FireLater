import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Notification Service
 * Testing notification, channel, preference, and template operations
 *
 * Key coverage areas:
 * - Notification CRUD operations
 * - Notification listing with filters
 * - Notification channels management
 * - User notification preferences
 * - Notification templates
 * - Send notification with template rendering
 * - Cache invalidation
 */

// Mock dependencies
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
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
import { notificationService } from '../../../src/services/notifications.js';
import { cacheService } from '../../../src/utils/cache.js';
import { logger } from '../../../src/utils/logger.js';

const tenantSlug = 'test';
const userId = 'user-123';
const notificationId = 'notif-456';
const channelId = 'channel-789';

describe('Notification Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  // ============================================
  // NOTIFICATION CRUD OPERATIONS
  // ============================================
  describe('list', () => {
    it('should list notifications for a user with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '50' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'notif-1',
              user_id: userId,
              event_type: 'issue_created',
              title: 'New Issue',
              body: 'A new issue was created',
              status: 'sent',
              read_at: null,
              created_at: new Date(),
            },
            {
              id: 'notif-2',
              user_id: userId,
              event_type: 'change_approved',
              title: 'Change Approved',
              body: 'Your change was approved',
              status: 'sent',
              read_at: new Date(),
              created_at: new Date(),
            },
          ],
        });

      const result = await notificationService.list(tenantSlug, userId, { page: 1, perPage: 20 });

      expect(result.total).toBe(50);
      expect(result.notifications).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        [userId]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT n.*'),
        [userId, 20, 0]
      );
    });

    it('should filter notifications by unread only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await notificationService.list(tenantSlug, userId, { page: 1, perPage: 20 }, { unreadOnly: true });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND n.read_at IS NULL'),
        [userId]
      );
    });

    it('should filter notifications by event type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await notificationService.list(tenantSlug, userId, { page: 1, perPage: 20 }, { eventType: 'issue_created' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND n.event_type = $2'),
        [userId, 'issue_created']
      );
    });

    it('should apply both filters together', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await notificationService.list(
        tenantSlug,
        userId,
        { page: 1, perPage: 20 },
        { unreadOnly: true, eventType: 'change_approved' }
      );

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/AND n\.read_at IS NULL.*AND n\.event_type = \$2/s),
        [userId, 'change_approved']
      );
    });

    it('should handle pagination offset correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await notificationService.list(tenantSlug, userId, { page: 3, perPage: 10 });

      // Offset should be (3-1) * 10 = 20
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [userId, 10, 20]
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '15' }] });

      const count = await notificationService.getUnreadCount(tenantSlug, userId);

      expect(count).toBe(15);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND read_at IS NULL'),
        [userId]
      );
    });

    it('should return 0 when no unread notifications', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const count = await notificationService.getUnreadCount(tenantSlug, userId);

      expect(count).toBe(0);
    });
  });

  describe('create', () => {
    it('should create a notification with all fields', async () => {
      const notification = {
        id: notificationId,
        user_id: userId,
        channel_id: channelId,
        event_type: 'issue_created',
        title: 'New Issue Created',
        body: 'Issue INC-001 was created',
        entity_type: 'issue',
        entity_id: 'issue-123',
        metadata: { issueNumber: 'INC-001' },
        status: 'pending',
        sent_at: null,
        read_at: null,
        error: null,
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [notification] });

      const result = await notificationService.create(tenantSlug, {
        userId,
        channelId,
        eventType: 'issue_created',
        title: 'New Issue Created',
        body: 'Issue INC-001 was created',
        entityType: 'issue',
        entityId: 'issue-123',
        metadata: { issueNumber: 'INC-001' },
      });

      expect(result).toEqual(notification);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.notifications'),
        [
          userId,
          channelId,
          'issue_created',
          'New Issue Created',
          'Issue INC-001 was created',
          'issue',
          'issue-123',
          '{"issueNumber":"INC-001"}',
        ]
      );
      expect(logger.info).toHaveBeenCalledWith(
        { notificationId },
        'Notification created'
      );
    });

    it('should create a notification with minimal fields', async () => {
      const notification = {
        id: notificationId,
        user_id: userId,
        channel_id: null,
        event_type: 'system_message',
        title: 'System Update',
        body: null,
        entity_type: null,
        entity_id: null,
        metadata: {},
        status: 'pending',
        sent_at: null,
        read_at: null,
        error: null,
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [notification] });

      const result = await notificationService.create(tenantSlug, {
        userId,
        eventType: 'system_message',
        title: 'System Update',
      });

      expect(result).toEqual(notification);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [userId, null, 'system_message', 'System Update', null, null, null, '{}']
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const notification = {
        id: notificationId,
        user_id: userId,
        event_type: 'issue_created',
        title: 'Test',
        read_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [notification] });

      const result = await notificationService.markAsRead(tenantSlug, notificationId, userId);

      expect(result).toEqual(notification);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.notifications'),
        [notificationId, userId]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET read_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should return null if notification not found or wrong user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.markAsRead(tenantSlug, 'invalid-id', userId);

      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 10 });

      const count = await notificationService.markAllAsRead(tenantSlug, userId);

      expect(count).toBe(10);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND read_at IS NULL'),
        [userId]
      );
    });

    it('should return 0 when no unread notifications', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const count = await notificationService.markAllAsRead(tenantSlug, userId);

      expect(count).toBe(0);
    });

    it('should handle null rowCount', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null });

      const count = await notificationService.markAllAsRead(tenantSlug, userId);

      expect(count).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete a notification', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationService.delete(tenantSlug, notificationId, userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.notifications'),
        [notificationId, userId]
      );
    });
  });

  // ============================================
  // NOTIFICATION CHANNELS
  // ============================================
  describe('listChannels', () => {
    it('should list active notification channels with caching', async () => {
      const channels = [
        { id: 'ch-1', name: 'Email', type: 'email', is_active: true },
        { id: 'ch-2', name: 'Slack', type: 'slack', is_active: true },
      ];

      mockQuery.mockResolvedValueOnce({ rows: channels });

      const result = await notificationService.listChannels(tenantSlug);

      expect(result).toEqual(channels);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test:notifications:channels:list',
        expect.any(Function),
        { ttl: 900 }
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE is_active = true ORDER BY name')
      );
    });
  });

  describe('createChannel', () => {
    it('should create a notification channel', async () => {
      const channel = {
        id: channelId,
        name: 'Teams',
        type: 'teams',
        integration_id: 'int-123',
        config: { webhookUrl: 'https://teams.example.com' },
        is_default: true,
        is_active: true,
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [channel] });

      const result = await notificationService.createChannel(tenantSlug, {
        name: 'Teams',
        type: 'teams',
        integrationId: 'int-123',
        config: { webhookUrl: 'https://teams.example.com' },
        isDefault: true,
      });

      expect(result).toEqual(channel);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.notification_channels'),
        ['Teams', 'teams', 'int-123', '{"webhookUrl":"https://teams.example.com"}', true]
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'notifications');
    });

    it('should create channel with minimal fields', async () => {
      const channel = {
        id: channelId,
        name: 'In-App',
        type: 'in_app',
        integration_id: null,
        config: {},
        is_default: false,
        is_active: true,
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [channel] });

      await notificationService.createChannel(tenantSlug, {
        name: 'In-App',
        type: 'in_app',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['In-App', 'in_app', null, '{}', false]
      );
    });
  });

  describe('updateChannel', () => {
    it('should update a notification channel', async () => {
      const channel = {
        id: channelId,
        name: 'Updated Email',
        type: 'email',
        config: { smtp: 'new-smtp.example.com' },
        is_default: true,
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [channel] });

      const result = await notificationService.updateChannel(tenantSlug, channelId, {
        name: 'Updated Email',
        config: { smtp: 'new-smtp.example.com' },
        isDefault: true,
        isActive: true,
      });

      expect(result).toEqual(channel);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.notification_channels SET'),
        expect.arrayContaining(['Updated Email', '{"smtp":"new-smtp.example.com"}', true, true, channelId])
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'notifications');
    });

    it('should return current channel when no updates provided', async () => {
      const channel = { id: channelId, name: 'Email', type: 'email' };

      mockQuery.mockResolvedValueOnce({ rows: [channel] });

      const result = await notificationService.updateChannel(tenantSlug, channelId, {});

      expect(result).toEqual(channel);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tenant_test.notification_channels WHERE id = $1'),
        [channelId]
      );
    });

    it('should throw NotFoundError when channel not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        notificationService.updateChannel(tenantSlug, 'invalid-id', { name: 'New Name' })
      ).rejects.toThrow('Notification channel');
    });
  });

  // ============================================
  // USER PREFERENCES
  // ============================================
  describe('getUserPreferences', () => {
    it('should get user notification preferences', async () => {
      const preferences = [
        { user_id: userId, event_type: 'issue_created', channel_id: 'ch-1', channel_name: 'Email', channel_type: 'email', enabled: true },
        { user_id: userId, event_type: 'issue_created', channel_id: 'ch-2', channel_name: 'Slack', channel_type: 'slack', enabled: false },
      ];

      mockQuery.mockResolvedValueOnce({ rows: preferences });

      const result = await notificationService.getUserPreferences(tenantSlug, userId);

      expect(result).toEqual(preferences);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN tenant_test.notification_channels nc'),
        [userId]
      );
    });

    it('should return empty array when no preferences set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.getUserPreferences(tenantSlug, userId);

      expect(result).toEqual([]);
    });
  });

  describe('updateUserPreference', () => {
    it('should create or update user preference', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationService.updateUserPreference(tenantSlug, userId, 'issue_created', channelId, true);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.notification_preferences'),
        [userId, 'issue_created', channelId, true]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (user_id, event_type, channel_id)'),
        expect.any(Array)
      );
    });

    it('should disable a notification preference', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationService.updateUserPreference(tenantSlug, userId, 'change_approved', channelId, false);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [userId, 'change_approved', channelId, false]
      );
    });
  });

  // ============================================
  // NOTIFICATION TEMPLATES
  // ============================================
  describe('listTemplates', () => {
    it('should list all notification templates with caching', async () => {
      const templates = [
        { id: 't-1', event_type: 'issue_created', channel_type: 'email', subject: 'New Issue', body_template: 'Issue {{number}}' },
        { id: 't-2', event_type: 'issue_created', channel_type: 'in_app', subject: null, body_template: 'Issue {{number}} created' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: templates });

      const result = await notificationService.listTemplates(tenantSlug);

      expect(result).toEqual(templates);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test:notifications:templates:list',
        expect.any(Function),
        { ttl: 900 }
      );
    });
  });

  describe('getTemplate', () => {
    it('should get a template by event type and channel type with caching', async () => {
      const template = {
        id: 't-1',
        event_type: 'issue_created',
        channel_type: 'email',
        subject: 'New Issue: {{title}}',
        body_template: 'A new issue {{number}} was created by {{user}}',
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [template] });

      const result = await notificationService.getTemplate(tenantSlug, 'issue_created', 'email');

      expect(result).toEqual(template);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test:notifications:template:issue_created:email',
        expect.any(Function),
        { ttl: 900 }
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE event_type = $1 AND channel_type = $2 AND is_active = true'),
        ['issue_created', 'email']
      );
    });

    it('should return null when template not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.getTemplate(tenantSlug, 'unknown_event', 'email');

      expect(result).toBeNull();
    });
  });

  describe('updateTemplate', () => {
    it('should update a notification template', async () => {
      const template = {
        id: 't-1',
        event_type: 'issue_created',
        channel_type: 'email',
        subject: 'Updated Subject',
        body_template: 'Updated body',
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [template] });

      const result = await notificationService.updateTemplate(tenantSlug, 'issue_created', 'email', {
        subject: 'Updated Subject',
        bodyTemplate: 'Updated body',
        isActive: true,
      });

      expect(result).toEqual(template);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.notification_templates SET'),
        expect.arrayContaining(['Updated Subject', 'Updated body', true, 'issue_created', 'email'])
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'notifications');
    });

    it('should return current template when no updates provided', async () => {
      const template = { id: 't-1', event_type: 'issue_created', channel_type: 'email' };

      mockQuery.mockResolvedValueOnce({ rows: [template] });

      const result = await notificationService.updateTemplate(tenantSlug, 'issue_created', 'email', {});

      expect(result).toEqual(template);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tenant_test.notification_templates WHERE event_type = $1 AND channel_type = $2'),
        ['issue_created', 'email']
      );
    });

    it('should throw NotFoundError when template not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        notificationService.updateTemplate(tenantSlug, 'unknown', 'email', { subject: 'Test' })
      ).rejects.toThrow('Notification template');
    });
  });

  // ============================================
  // SEND NOTIFICATION
  // ============================================
  describe('sendNotification', () => {
    it('should send notification using user preferences', async () => {
      // User preferences query
      mockQuery.mockResolvedValueOnce({
        rows: [{ channel_id: channelId, channel_type: 'in_app' }],
      });

      // Template query (via cacheService.getOrSet which calls the fetcher)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 't-1',
          event_type: 'issue_created',
          channel_type: 'in_app',
          subject: 'New Issue: {{title}}',
          body_template: 'Issue {{number}} created by {{user}}',
          is_active: true,
        }],
      });

      // Create notification INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: notificationId,
          user_id: userId,
          event_type: 'issue_created',
          title: 'New Issue: Server Down',
          body: 'Issue INC-001 created by John',
          status: 'pending',
        }],
      });

      // Mark as sent UPDATE
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await notificationService.sendNotification(tenantSlug, {
        userId,
        eventType: 'issue_created',
        entityType: 'issue',
        entityId: 'issue-123',
        data: { title: 'Server Down', number: 'INC-001', user: 'John' },
      });

      expect(result).not.toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ notificationId, eventType: 'issue_created' }),
        'Notification sent'
      );
    });

    it('should use default channels when no user preferences exist', async () => {
      // User preferences query - empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Default channels query
      mockQuery.mockResolvedValueOnce({
        rows: [{ channel_id: channelId, channel_type: 'in_app' }],
      });

      // Template query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 't-1',
          event_type: 'change_approved',
          channel_type: 'in_app',
          subject: 'Change Approved',
          body_template: 'Change {{number}} approved',
          is_active: true,
        }],
      });

      // Create notification INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: notificationId,
          user_id: userId,
          event_type: 'change_approved',
          status: 'pending',
        }],
      });

      // Mark as sent UPDATE
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationService.sendNotification(tenantSlug, {
        userId,
        eventType: 'change_approved',
        data: { number: 'CHG-001' },
      });

      // Verify default channels query was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE is_default = true AND is_active = true')
      );
    });

    it('should return null when no template and no channels', async () => {
      // User preferences query - empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Default channels query - empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Template query - returns null
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.sendNotification(tenantSlug, {
        userId,
        eventType: 'unknown_event',
        data: {},
      });

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        { eventType: 'unknown_event' },
        'No template or channels for notification'
      );
    });

    it('should use event type as title when template has no subject', async () => {
      // User preferences query
      mockQuery.mockResolvedValueOnce({
        rows: [{ channel_id: channelId, channel_type: 'in_app' }],
      });

      // Template query with null subject
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 't-1',
          event_type: 'system_alert',
          channel_type: 'in_app',
          subject: null,
          body_template: 'Alert: {{message}}',
          is_active: true,
        }],
      });

      // Create notification INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: notificationId,
          user_id: userId,
          event_type: 'system_alert',
          title: 'system_alert',
          body: 'Alert: System overloaded',
        }],
      });

      // Mark as sent UPDATE
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await notificationService.sendNotification(tenantSlug, {
        userId,
        eventType: 'system_alert',
        data: { message: 'System overloaded' },
      });

      expect(result).not.toBeNull();
    });

    it('should render template variables correctly', async () => {
      // User preferences query
      mockQuery.mockResolvedValueOnce({
        rows: [{ channel_id: channelId, channel_type: 'in_app' }],
      });

      // Template with multiple variables
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 't-1',
          event_type: 'issue_assigned',
          channel_type: 'in_app',
          subject: '{{issueNumber}}: {{title}}',
          body_template: 'Hi {{assignee}}, you have been assigned issue {{issueNumber}} by {{reporter}}',
          is_active: true,
        }],
      });

      // Create notification INSERT - capture the actual values
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: notificationId,
          user_id: userId,
          event_type: 'issue_assigned',
          title: 'INC-999: Critical Bug',
          body: 'Hi Alice, you have been assigned issue INC-999 by Bob',
        }],
      });

      // Mark as sent UPDATE
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await notificationService.sendNotification(tenantSlug, {
        userId,
        eventType: 'issue_assigned',
        data: {
          issueNumber: 'INC-999',
          title: 'Critical Bug',
          assignee: 'Alice',
          reporter: 'Bob',
        },
      });

      // Verify the INSERT was called with rendered values
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.notifications'),
        expect.arrayContaining([
          userId,
          null,
          'issue_assigned',
          'INC-999: Critical Bug',
          'Hi Alice, you have been assigned issue INC-999 by Bob',
        ])
      );
    });

    it('should handle missing template variables gracefully', async () => {
      // User preferences query
      mockQuery.mockResolvedValueOnce({
        rows: [{ channel_id: channelId, channel_type: 'in_app' }],
      });

      // Template with variables that won't be provided
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 't-1',
          event_type: 'test_event',
          channel_type: 'in_app',
          subject: '{{missing}}',
          body_template: 'Value: {{undefined}}',
          is_active: true,
        }],
      });

      // Create notification - missing values should become empty strings
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: notificationId,
          user_id: userId,
          event_type: 'test_event',
          title: '',
          body: 'Value: ',
        }],
      });

      // Mark as sent UPDATE
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await notificationService.sendNotification(tenantSlug, {
        userId,
        eventType: 'test_event',
        data: {},
      });

      expect(result).not.toBeNull();
    });
  });

  // ============================================
  // SQL INJECTION PREVENTION
  // ============================================
  describe('SQL injection prevention', () => {
    it('should use parameterized queries for user input in list', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await notificationService.list(
        tenantSlug,
        "'; DROP TABLE notifications; --",
        { page: 1, perPage: 20 },
        { eventType: "'; DELETE FROM users; --" }
      );

      // Verify parameters are passed separately, not interpolated
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        ["'; DROP TABLE notifications; --", "'; DELETE FROM users; --"]
      );
    });

    it('should use parameterized queries for channel creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: channelId }] });

      await notificationService.createChannel(tenantSlug, {
        name: "'); DROP TABLE channels; --",
        type: 'email',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ["'); DROP TABLE channels; --", 'email', null, '{}', false]
      );
    });
  });

  // ============================================
  // SCHEMA ISOLATION
  // ============================================
  describe('tenant schema isolation', () => {
    it('should use tenant schema in all queries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await notificationService.getUnreadCount('another_tenant', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_test.notifications'),
        expect.any(Array)
      );
    });
  });
});
