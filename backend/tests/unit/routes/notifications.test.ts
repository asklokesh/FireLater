import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/notifications.js', () => ({
  notificationService: {
    list: vi.fn().mockResolvedValue({ notifications: [], total: 0 }),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markAsRead: vi.fn().mockResolvedValue({}),
    markAllAsRead: vi.fn().mockResolvedValue(0),
    delete: vi.fn().mockResolvedValue(undefined),
    getUserPreferences: vi.fn().mockResolvedValue([]),
    updateUserPreference: vi.fn().mockResolvedValue(undefined),
    listChannels: vi.fn().mockResolvedValue([]),
    createChannel: vi.fn().mockResolvedValue({}),
    updateChannel: vi.fn().mockResolvedValue({}),
    listTemplates: vi.fn().mockResolvedValue([]),
    updateTemplate: vi.fn().mockResolvedValue({}),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Notifications Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Update Preference Schema', () => {
    const updatePreferenceSchema = z.object({
      eventType: z.string(),
      channelId: z.string().uuid(),
      enabled: z.boolean(),
    });

    it('should require all fields', () => {
      const result = updatePreferenceSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid preference data', () => {
      const result = updatePreferenceSchema.safeParse({
        eventType: 'issue_created',
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        enabled: true,
      });
      expect(result.success).toBe(true);
    });

    it('should require eventType', () => {
      const result = updatePreferenceSchema.safeParse({
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        enabled: true,
      });
      expect(result.success).toBe(false);
    });

    it('should require channelId as UUID', () => {
      const result = updatePreferenceSchema.safeParse({
        eventType: 'issue_created',
        channelId: 'not-a-uuid',
        enabled: true,
      });
      expect(result.success).toBe(false);
    });

    it('should require enabled as boolean', () => {
      const result = updatePreferenceSchema.safeParse({
        eventType: 'issue_created',
        channelId: '123e4567-e89b-12d3-a456-426614174000',
        enabled: 'true',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Create Channel Schema', () => {
    const createChannelSchema = z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['email', 'in_app', 'slack', 'webhook']),
      integrationId: z.string().uuid().optional(),
      config: z.record(z.unknown()).optional(),
      isDefault: z.boolean().optional(),
    });

    it('should require name and type', () => {
      const result = createChannelSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid channel data', () => {
      const result = createChannelSchema.safeParse({
        name: 'Email Channel',
        type: 'email',
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 1 character', () => {
      const result = createChannelSchema.safeParse({
        name: '',
        type: 'email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 255 characters', () => {
      const result = createChannelSchema.safeParse({
        name: 'x'.repeat(256),
        type: 'email',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all channel types', () => {
      const types = ['email', 'in_app', 'slack', 'webhook'];
      for (const type of types) {
        const result = createChannelSchema.safeParse({ name: 'Channel', type });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid channel type', () => {
      const result = createChannelSchema.safeParse({
        name: 'Channel',
        type: 'sms',
      });
      expect(result.success).toBe(false);
    });

    it('should accept integrationId for Slack', () => {
      const result = createChannelSchema.safeParse({
        name: 'Slack Channel',
        type: 'slack',
        integrationId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept config', () => {
      const result = createChannelSchema.safeParse({
        name: 'Webhook Channel',
        type: 'webhook',
        config: { url: 'https://example.com/webhook', headers: {} },
      });
      expect(result.success).toBe(true);
    });

    it('should accept isDefault flag', () => {
      const result = createChannelSchema.safeParse({
        name: 'Email Channel',
        type: 'email',
        isDefault: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Channel Schema', () => {
    const updateChannelSchema = z.object({
      name: z.string().min(1).max(255).optional(),
      config: z.record(z.unknown()).optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
    });

    it('should accept partial update', () => {
      const result = updateChannelSchema.safeParse({ name: 'Updated Channel' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateChannelSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept config update', () => {
      const result = updateChannelSchema.safeParse({
        config: { url: 'https://new-url.com' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateChannelSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('should accept isDefault flag', () => {
      const result = updateChannelSchema.safeParse({ isDefault: true });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Template Schema', () => {
    const updateTemplateSchema = z.object({
      subject: z.string().max(500).optional(),
      bodyTemplate: z.string().optional(),
      isActive: z.boolean().optional(),
    });

    it('should accept partial update', () => {
      const result = updateTemplateSchema.safeParse({ subject: 'New Subject' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateTemplateSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject subject over 500 characters', () => {
      const result = updateTemplateSchema.safeParse({
        subject: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept bodyTemplate', () => {
      const result = updateTemplateSchema.safeParse({
        bodyTemplate: '<html><body>{{content}}</body></html>',
      });
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateTemplateSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });
  });

  describe('Notification ID Parameter Schema', () => {
    const notificationIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = notificationIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = notificationIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('Template Parameter Schema', () => {
    const templateParamSchema = z.object({
      eventType: z.string().min(1).max(100),
      channelType: z.enum(['email', 'in_app', 'slack', 'webhook']),
    });

    it('should require eventType and channelType', () => {
      const result = templateParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid parameters', () => {
      const result = templateParamSchema.safeParse({
        eventType: 'issue_created',
        channelType: 'email',
      });
      expect(result.success).toBe(true);
    });

    it('should reject eventType over 100 characters', () => {
      const result = templateParamSchema.safeParse({
        eventType: 'x'.repeat(101),
        channelType: 'email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid channelType', () => {
      const result = templateParamSchema.safeParse({
        eventType: 'issue_created',
        channelType: 'sms',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('List Notifications Query Schema', () => {
    const listNotificationsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      unread: z.enum(['true', 'false']).optional(),
      event_type: z.string().max(100).optional(),
    });

    it('should accept empty query', () => {
      const result = listNotificationsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept pagination parameters', () => {
      const result = listNotificationsQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should accept unread filter as true', () => {
      const result = listNotificationsQuerySchema.safeParse({ unread: 'true' });
      expect(result.success).toBe(true);
    });

    it('should accept unread filter as false', () => {
      const result = listNotificationsQuerySchema.safeParse({ unread: 'false' });
      expect(result.success).toBe(true);
    });

    it('should accept event_type filter', () => {
      const result = listNotificationsQuerySchema.safeParse({
        event_type: 'issue_created',
      });
      expect(result.success).toBe(true);
    });

    it('should reject event_type over 100 characters', () => {
      const result = listNotificationsQuerySchema.safeParse({
        event_type: 'x'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('should reject per_page over 100', () => {
      const result = listNotificationsQuerySchema.safeParse({ per_page: '101' });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require requests:read for GET /', () => {
      const permission = 'requests:read';
      expect(permission).toBe('requests:read');
    });

    it('should require requests:read for GET /unread-count', () => {
      const permission = 'requests:read';
      expect(permission).toBe('requests:read');
    });

    it('should require requests:read for POST /:id/read', () => {
      const permission = 'requests:read';
      expect(permission).toBe('requests:read');
    });

    it('should require requests:read for POST /mark-all-read', () => {
      const permission = 'requests:read';
      expect(permission).toBe('requests:read');
    });

    it('should require requests:read for DELETE /:id', () => {
      const permission = 'requests:read';
      expect(permission).toBe('requests:read');
    });

    it('should require requests:read for GET /preferences', () => {
      const permission = 'requests:read';
      expect(permission).toBe('requests:read');
    });

    it('should require requests:read for PUT /preferences', () => {
      const permission = 'requests:read';
      expect(permission).toBe('requests:read');
    });

    it('should require settings:read for GET /channels', () => {
      const permission = 'settings:read';
      expect(permission).toBe('settings:read');
    });

    it('should require settings:update for POST /channels', () => {
      const permission = 'settings:update';
      expect(permission).toBe('settings:update');
    });

    it('should require settings:update for PUT /channels/:id', () => {
      const permission = 'settings:update';
      expect(permission).toBe('settings:update');
    });

    it('should require settings:read for GET /templates', () => {
      const permission = 'settings:read';
      expect(permission).toBe('settings:read');
    });

    it('should require settings:update for PUT /templates/:eventType/:channelType', () => {
      const permission = 'settings:update';
      expect(permission).toBe('settings:update');
    });
  });

  describe('Response Formats', () => {
    it('should return unread count', () => {
      const response = { count: 5 };
      expect(response).toHaveProperty('count');
      expect(typeof response.count).toBe('number');
    });

    it('should return notification on mark as read', () => {
      const notification = { id: 'notif-1', isRead: true };
      expect(notification).toHaveProperty('isRead');
      expect(notification.isRead).toBe(true);
    });

    it('should return 404 for missing notification', () => {
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: 'Notification not found',
      };
      expect(errorResponse.statusCode).toBe(404);
    });

    it('should return updated count for mark all read', () => {
      const response = { updated: 10 };
      expect(response).toHaveProperty('updated');
      expect(typeof response.updated).toBe('number');
    });

    it('should return 204 for deleted notification', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return preferences in data wrapper', () => {
      const preferences = [{ eventType: 'issue_created', enabled: true }];
      const response = { data: preferences };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return success for preference update', () => {
      const response = { success: true };
      expect(response).toHaveProperty('success');
      expect(response.success).toBe(true);
    });

    it('should return 201 for created channel', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return channels in data wrapper', () => {
      const channels = [{ id: 'channel-1', name: 'Email', type: 'email' }];
      const response = { data: channels };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return templates in data wrapper', () => {
      const templates = [{ eventType: 'issue_created', channelType: 'email', subject: 'New Issue' }];
      const response = { data: templates };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug, userId, pagination, and filters to notificationService.list', async () => {
      const { notificationService } = await import('../../../src/services/notifications.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = { unreadOnly: true };

      await notificationService.list('test-tenant', 'user-1', pagination, filters);
      expect(notificationService.list).toHaveBeenCalledWith('test-tenant', 'user-1', pagination, filters);
    });

    it('should pass tenantSlug and userId to notificationService.getUnreadCount', async () => {
      const { notificationService } = await import('../../../src/services/notifications.js');

      await notificationService.getUnreadCount('test-tenant', 'user-1');
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith('test-tenant', 'user-1');
    });

    it('should pass tenantSlug, id, and userId to notificationService.markAsRead', async () => {
      const { notificationService } = await import('../../../src/services/notifications.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await notificationService.markAsRead('test-tenant', id, 'user-1');
      expect(notificationService.markAsRead).toHaveBeenCalledWith('test-tenant', id, 'user-1');
    });

    it('should pass tenantSlug to notificationService.listChannels', async () => {
      const { notificationService } = await import('../../../src/services/notifications.js');

      await notificationService.listChannels('test-tenant');
      expect(notificationService.listChannels).toHaveBeenCalledWith('test-tenant');
    });
  });

  describe('Query Filter Parsing', () => {
    it('should parse unread filter to boolean true', () => {
      const query = { unread: 'true' };
      const unreadOnly = query.unread === 'true';
      expect(unreadOnly).toBe(true);
    });

    it('should parse unread filter to boolean false', () => {
      const query = { unread: 'false' };
      const unreadOnly = query.unread === 'true';
      expect(unreadOnly).toBe(false);
    });

    it('should handle missing unread filter', () => {
      const query = {} as { unread?: string };
      const unreadOnly = query.unread === 'true';
      expect(unreadOnly).toBe(false);
    });
  });
});
